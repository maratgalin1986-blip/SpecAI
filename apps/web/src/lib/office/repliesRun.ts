// Офис читает ответы на свои письма и ведёт фирму дальше сам (владелец, 2026-11-11). Проход:
// открыть «Входящие» на чтение → взять письма новее закладки → оставить только письма от фирм,
// которым офис писал, и отчёты о недоставке → разобрать (lib/office/replies.ts) → отметить в
// карточке, ответить, сообщить владельцу в Telegram. Посторонние письма ящика не читаются и нигде
// не сохраняются. Закладка (`office.mailCursor`) при первом запуске ставится на конец ящика:
// старую почту офис не разбирает.
import { prisma } from '@specai/database';
import { notifyTelegram } from '@/lib/notify';
import { siteUrl } from '@/lib/siteUrl';
import { DUPLICATE_CLOSED_AT } from './contacted';
import { openOfficeInbox, type InboxMessage, type InboxSession } from './mailbox';
import { officePrices } from './prices';
import {
  addressesIn,
  buildReplyAnswer,
  classifyReply,
  isBounce,
  replyNotice,
  replyTop,
  type ReplyKind,
} from './replies';
import { sendOfficeMail, type OfficeMail, type OfficeMailResult } from './smtp';

export const MAIL_CURSOR_KEY = 'office.mailCursor';
export const MAIL_READ_KEY = 'office.lastMailRead';
/** Сколько писем ящика просматривается за проход (только отправитель и тема). */
export const MAIL_LIST_LIMIT = 200;
/** Сколько ответов и отчётов разбирается за проход: у каждого читается текст. */
export const MAIL_HANDLE_LIMIT = 8;
/** Статусы, в которых офис ещё ведёт фирму сам; дальше — работа владельца с клиентом. */
const LEAD_STATUSES = ['CONTACTED', 'READY', 'CALLBACK'];
/** Отчёт о недоставке относим к письму не старше этого. */
const BOUNCE_WINDOW_MS = 7 * 86_400_000;

export interface ReplyRow {
  id: string;
  kind: string;
  status: string;
  slug: string;
  token: string;
  name: string;
  city: string | null;
  email: string | null;
  emailSentAt: Date | null;
  repliedAt: Date | null;
  replyAnsweredAt: Date | null;
  followUpSentAt: Date | null;
}

const ROW_SELECT = {
  id: true,
  kind: true,
  status: true,
  slug: true,
  token: true,
  name: true,
  city: true,
  email: true,
  emailSentAt: true,
  repliedAt: true,
  replyAnsweredAt: true,
  followUpSentAt: true,
} as const;

export interface RepliesDb {
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
  prospect: {
    findMany(args: {
      where: {
        emailSentAt: { not: null } | { gte: Date };
        email: { in: string[]; mode: 'insensitive' };
      };
      select: typeof ROW_SELECT;
      orderBy: { emailSentAt: 'desc' };
      take: number;
    }): Promise<ReplyRow[]>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface RepliesResult {
  /** 'no-mailbox' — ящик не настроен; 'first-run' — закладка поставлена, почта не разбиралась. */
  skipped: 'no-mailbox' | 'first-run' | null;
  /** Писем просмотрено (отправитель и тема). */
  seen: number;
  replies: number;
  answered: number;
  stops: number;
  bounces: number;
  /** Ответов, после которых нужен владелец (согласие или непонятное письмо). */
  needOwner: number;
  /** Номер следующего письма в ящике и закладка офиса: по ним видно, что новая почта замечена. */
  uidNext?: number;
  cursor?: number;
  /** Ящик не открылся или чтение оборвалось: текст ошибки сервера без адресов. */
  error?: string;
}

export interface RepliesDeps {
  db?: RepliesDb;
  open?: () => Promise<InboxSession | null>;
  send?: (mail: OfficeMail) => Promise<OfficeMailResult>;
  notify?: (message: string) => Promise<boolean>;
  prices?: () => Promise<{ setup: number; monthly: number }>;
  baseUrl?: () => string;
  /** Сколько миллисекунд есть у прохода. */
  budgetMs?: number;
  clock?: () => number;
}

function parseCursor(value: string | undefined): { validity: string; uid: number } | null {
  const match = /^([^:]+):(\d+)$/.exec(value ?? '');
  return match ? { validity: match[1]!, uid: Number(match[2]) } : null;
}

function safeError(error: unknown): string {
  // imapflow на отказ входа даёт «Command failed»; настоящий ответ сервера — в responseText.
  const e = error as { authenticationFailed?: boolean; responseText?: string };
  const base = error instanceof Error ? error.message : String(error);
  const text = e?.authenticationFailed
    ? `Вход в ящик отклонён: ${e.responseText ?? base}`
    : e?.responseText
      ? `${base}: ${e.responseText}`
      : base;
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '<адрес>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: нет ответа за ${ms} мс`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Один проход чтения ответов. Не бросает: ошибка ящика возвращается в `error`. */
export async function readReplies(now: Date, deps: RepliesDeps = {}): Promise<RepliesResult> {
  const db: RepliesDb = deps.db ?? (prisma as unknown as RepliesDb);
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const budgetMs = deps.budgetMs ?? 12_000;
  const timeLeft = () => budgetMs - (clock() - startedAt);
  const result: RepliesResult = {
    skipped: null,
    seen: 0,
    replies: 0,
    answered: 0,
    stops: 0,
    bounces: 0,
    needOwner: 0,
  };
  let session: InboxSession | null = null;
  try {
    session = await withDeadline(
      (deps.open ?? (() => openOfficeInbox()))(),
      Math.max(1_000, Math.min(10_000, budgetMs)),
      'Ящик',
    );
    if (!session) {
      result.skipped = 'no-mailbox';
      return result;
    }
    const saved = parseCursor(
      (await db.appSetting.findUnique({ where: { key: MAIL_CURSOR_KEY } }))?.value,
    );
    const saveCursor = async (uid: number) => {
      const value = `${session!.uidValidity}:${uid}`;
      await db.appSetting.upsert({
        where: { key: MAIL_CURSOR_KEY },
        create: { key: MAIL_CURSOR_KEY, value },
        update: { value },
      });
    };
    if (!saved || saved.validity !== session.uidValidity) {
      await saveCursor(Math.max(0, session.uidNext - 1));
      result.skipped = 'first-run';
      return result;
    }
    result.uidNext = session.uidNext;
    result.cursor = saved.uid;
    const messages = await session.list(saved.uid, MAIL_LIST_LIMIT);
    result.seen = messages.length;
    if (messages.length === 0) return result;

    const senders = [...new Set(messages.map((m) => m.from).filter(Boolean))];
    const known = senders.length
      ? await db.prospect.findMany({
          where: { emailSentAt: { not: null }, email: { in: senders, mode: 'insensitive' } },
          select: ROW_SELECT,
          orderBy: { emailSentAt: 'desc' },
          take: 200,
        })
      : [];
    const byEmail = new Map<string, ReplyRow[]>();
    for (const row of known) {
      const key = (row.email ?? '').trim().toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), row]);
    }

    const send = deps.send ?? sendOfficeMail;
    const notify = deps.notify ?? notifyTelegram;
    const base = (deps.baseUrl ?? siteUrl)().replace(/\/+$/, '');
    let prices: { setup: number; monthly: number } | null = null;
    let handled = 0;
    let cursor = saved.uid;

    for (const message of messages) {
      const rows = byEmail.get(message.from) ?? [];
      const bounce = rows.length === 0 && isBounce(message);
      if (rows.length === 0 && !bounce) {
        cursor = message.uid;
        continue;
      }
      // Письмо, на которое не хватило времени или лимита, останется за закладкой до следующего прохода.
      if (handled >= MAIL_HANDLE_LIMIT || timeLeft() < 4_000) break;
      handled += 1;
      const text = await session.text(message.uid);
      if (bounce) {
        result.bounces += await applyBounce(db, text, now);
      } else if (message.autoSubmitted) {
        // Автоответ («в отпуске») — не ответ фирмы.
      } else {
        const top = replyTop(text);
        const kind = classifyReply({ subject: message.subject, text });
        if (kind !== 'auto') {
          prices ??= await (deps.prices ?? officePrices)();
          await applyReply({
            db,
            rows,
            message,
            kind,
            top,
            now,
            send,
            notify,
            base,
            prices,
            result,
          });
        }
      }
      cursor = message.uid;
    }
    if (cursor !== saved.uid) {
      await saveCursor(cursor);
      result.cursor = cursor;
    }
    return result;
  } catch (error) {
    result.error = safeError(error);
    return result;
  } finally {
    if (session) await session.close().catch(() => undefined);
    await db.appSetting
      .upsert({
        where: { key: MAIL_READ_KEY },
        create: { key: MAIL_READ_KEY, value: JSON.stringify({ at: now.toISOString(), ...result }) },
        update: { value: JSON.stringify({ at: now.toISOString(), ...result }) },
      })
      .catch(() => undefined);
  }
}

/** Отчёт о недоставке: адреса из отчёта, которым писали за последнюю неделю, помечаются. */
async function applyBounce(db: RepliesDb, text: string, now: Date): Promise<number> {
  const addresses = addressesIn(text).slice(0, 20);
  if (addresses.length === 0) return 0;
  const rows = await db.prospect.findMany({
    where: {
      emailSentAt: { gte: new Date(now.getTime() - BOUNCE_WINDOW_MS) },
      email: { in: addresses, mode: 'insensitive' },
    },
    select: ROW_SELECT,
    orderBy: { emailSentAt: 'desc' },
    take: 20,
  });
  for (const row of rows) {
    await db.prospect.update({
      where: { id: row.id },
      data: {
        emailBouncedAt: now,
        outreachError: 'Письмо не доставлено: адрес не принимает почту',
        outreachErrorAt: now,
        // Напоминание на мёртвый адрес не уходит.
        ...(row.followUpSentAt ? {} : { followUpSentAt: DUPLICATE_CLOSED_AT }),
      },
    });
  }
  return rows.length;
}

async function applyReply(input: {
  db: RepliesDb;
  rows: ReplyRow[];
  message: InboxMessage;
  kind: ReplyKind;
  top: string;
  now: Date;
  send: (mail: OfficeMail) => Promise<OfficeMailResult>;
  notify: (message: string) => Promise<boolean>;
  base: string;
  prices: { setup: number; monthly: number };
  result: RepliesResult;
}): Promise<void> {
  const { db, rows, message, kind, top, now, result } = input;
  // С одного адреса могли прийти несколько карточек (сеть точек): ведём самую свежую.
  const row = rows[0]!;
  const leading = LEAD_STATUSES.includes(row.status);
  result.replies += 1;
  for (const each of rows) {
    const stop = kind === 'stop' && LEAD_STATUSES.includes(each.status);
    await db.prospect.update({
      where: { id: each.id },
      data: {
        repliedAt: now,
        replyText: top,
        ...(stop ? { status: 'DECLINED', declinedAt: now, optOutAt: now } : {}),
      },
    });
  }
  if (kind === 'stop') result.stops += 1;

  let answered = false;
  // Отвечаем сами один раз и только пока фирма не стала клиентом: дальше переписку ведёт владелец.
  if (leading && !row.replyAnsweredAt && row.kind !== 'provider') {
    const answer = buildReplyAnswer(kind, {
      name: row.name,
      slug: row.slug,
      previewUrl: `${input.base}/preview/${encodeURIComponent(row.token)}`,
      baseUrl: input.base,
      prices: input.prices,
      subject: message.subject,
    });
    if (answer && row.email) {
      const sent = await input.send({
        to: row.email,
        subject: answer.subject,
        html: answer.html,
        text: answer.text,
        ...(message.messageId
          ? { headers: { 'In-Reply-To': message.messageId, References: message.messageId } }
          : {}),
      });
      if (sent.ok) {
        answered = true;
        result.answered += 1;
        await db.prospect.update({ where: { id: row.id }, data: { replyAnsweredAt: now } });
      }
    }
  }
  if (kind === 'agree' || kind === 'other' || (!answered && kind !== 'stop')) result.needOwner += 1;
  await input.notify(
    replyNotice({
      kind,
      name: row.name,
      city: row.city,
      text: top,
      answered,
      adminUrl: `${input.base}/admin/office`,
    }),
  );
}
