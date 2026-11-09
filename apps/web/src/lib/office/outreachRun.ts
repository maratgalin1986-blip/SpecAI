// Рассылка кандидатам (R18): один проход крона — кому ещё не писали, тем одно письмо и/или
// одно сообщение WhatsApp со ссылкой на превью; дневной лимит на канал по московским суткам;
// пауза одной кнопкой. Ответ «стоп» из вебхука WhatsApp переводит кандидата в DECLINED.
// База и отправители внедряются через deps, чтобы тесты шли без сети и без Prisma.
import { prisma } from '@specai/database';
import { mskDayBounds } from '@/lib/adminCrm';
import { sendEmail } from '@/lib/email';
import { sendWhatsApp, serverChannels } from '@/lib/notifications/adapters';
import { siteUrl } from '@/lib/siteUrl';
import { nicheTitle } from './niches';
import {
  buildEmail,
  buildWhatsAppText,
  pickChannels,
  isStopReply,
  whatsappTarget,
  type OutreachChannels,
  type OutreachProspect,
  OUTREACH_STATUSES,
} from './outreach';
import { officePrices } from './prices';
import { readOfficeSettings } from '@/lib/office/settings';

/** Настройки рассылки из /admin/office (lib/office/settings.ts, T6). */
export interface OutreachRunSettings {
  outreachPaused: boolean;
  dailyCap: number;
  replyTo: string;
  whatsappToPhone: boolean;
}

/** Строка Prospect, как её читает рассылка. */
export interface OutreachRow {
  id: string;
  kind: string;
  status: string;
  slug: string;
  token: string;
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  niche: string;
  tags: string | null;
  hours: string | null;
  emailSentAt: Date | null;
  whatsappSentAt: Date | null;
  contactedAt: Date | null;
}

type DateRange = { gte: Date; lt: Date };

/** Ровно те запросы к Prospect, которые делает этот модуль (prisma подходит структурно). */
export interface OutreachDb {
  prospect: {
    count(args: {
      where: { emailSentAt?: DateRange; whatsappSentAt?: DateRange };
    }): Promise<number>;
    findMany(args: {
      where: {
        status: { in: string[] };
        OR?: { whatsapp?: { endsWith: string }; phone?: { endsWith: string } }[];
        NOT?: { outreachError: { not: null }; updatedAt: { gte: Date } };
      };
      orderBy:
        | { createdAt: 'asc' }
        | { contactedAt: 'desc' }
        | ({ outreachError: { sort: 'asc'; nulls: 'first' } } | { createdAt: 'asc' })[];
      take: number;
    }): Promise<OutreachRow[]>;
    /** Запись меняется только пока она ещё в рассылке: «Согласился»/«стоп» за время прохода не перетираются. */
    updateMany(args: {
      where: { id: string; status: { in: string[] } };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: {
        status?: string;
        emailSentAt?: Date;
        whatsappSentAt?: Date;
        contactedAt?: Date;
        repliedAt?: Date;
        declinedAt?: Date;
        outreachError?: string | null;
      };
    }): Promise<unknown>;
  };
}

export interface OutreachDeps {
  db?: OutreachDb;
  settings?: () => Promise<OutreachRunSettings>;
  email?: typeof sendEmail;
  whatsapp?: typeof sendWhatsApp;
  channels?: () => OutreachChannels;
  prices?: () => Promise<{ setup: number; monthly: number }>;
  sleep?: (ms: number) => Promise<void>;
  /** Базовый адрес площадки для ссылок на превью. */
  baseUrl?: () => string;
  /** Часы для бюджета времени (по умолчанию Date.now). */
  clock?: () => number;
  /** Сколько миллисекунд есть у этого прохода (крон делит своё время между шагами). */
  budgetMs?: number;
}

export interface OutreachResult {
  email: number;
  whatsapp: number;
  /** Почему проход ничего не сделал: 'paused' — рассылка на паузе; null — работал. */
  skipped: string | null;
  errors: number;
}

/** Сколько кандидатов берём за проход: лимит в день редко больше. */
export const OUTREACH_BATCH = 50;
/** Бюджет времени прохода, мс — укладываемся в maxDuration крона. */
export const OUTREACH_BUDGET_MS = 40_000;
/** Одна отправка (Resend / Green API) не длиннее этого — иначе функция крона не успеет записать отметку. */
export const SEND_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: нет ответа за ${Math.round(ms / 1000)} с`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
/** Пауза между сообщениями WhatsApp, мс (1–2 с, как у живого человека). */
export const WHATSAPP_PAUSE_MS: readonly [number, number] = [1000, 2000];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pauseMs(): number {
  const [min, max] = WHATSAPP_PAUSE_MS;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Текст ошибки для outreachError: по-русски, не длиннее 300 символов. */
export function outreachErrorText(channel: 'email' | 'whatsapp', reason: string): string {
  const label = channel === 'email' ? 'Письмо не отправлено' : 'WhatsApp не отправлен';
  return `${label}: ${reason}`.slice(0, 300);
}

function previewUrlOf(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/preview/${encodeURIComponent(token)}`;
}

function toProspect(row: OutreachRow): OutreachProspect {
  return {
    kind: row.kind === 'provider' ? 'provider' : 'site',
    status: row.status,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    lat: row.lat,
    lon: row.lon,
    tags: row.tags,
    hours: row.hours,
    email: row.email,
  };
}

/**
 * Один проход рассылки. Возвращает, сколько писем и сообщений ушло, сколько ошибок,
 * и `skipped: 'paused'`, если владелец поставил рассылку на паузу.
 */
export async function sendOutreach(now: Date, deps: OutreachDeps = {}): Promise<OutreachResult> {
  const budgetMs = Math.max(0, deps.budgetMs ?? OUTREACH_BUDGET_MS);
  if (budgetMs < 2_000) return { email: 0, whatsapp: 0, skipped: 'no-time', errors: 0 };
  const db: OutreachDb = deps.db ?? prisma;
  const settings = await (deps.settings ?? readOfficeSettings)();
  const result: OutreachResult = { email: 0, whatsapp: 0, skipped: null, errors: 0 };
  if (settings.outreachPaused) return { ...result, skipped: 'paused' };

  const channels = (deps.channels ?? serverChannels)();
  const cap = Math.max(0, Math.floor(settings.dailyCap));
  const bounds = mskDayBounds(now);
  const day = { gte: bounds.start, lt: bounds.end };
  const [emailToday, whatsappToday] = await Promise.all([
    db.prospect.count({ where: { emailSentAt: day } }),
    db.prospect.count({ where: { whatsappSentAt: day } }),
  ]);
  let emailLeft = Math.max(0, cap - emailToday);
  let whatsappLeft = Math.max(0, cap - whatsappToday);
  const active: OutreachChannels = {
    email: channels.email && emailLeft > 0,
    whatsapp: channels.whatsapp && whatsappLeft > 0,
  };
  if (!active.email && !active.whatsapp) return result;

  // Сначала те, у кого отправка ещё не падала; упавшие сегодня ждут до завтра —
  // одна повторная попытка в день, чтобы вечно битые адреса не съедали проход.
  const rows = await db.prospect.findMany({
    where: {
      status: { in: ['READY', 'CONTACTED'] },
      NOT: { outreachError: { not: null }, updatedAt: { gte: bounds.start } },
    },
    orderBy: [{ outreachError: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: OUTREACH_BATCH,
  });
  if (rows.length === 0) return result;

  const prices = await (deps.prices ?? officePrices)();
  const baseUrl = (deps.baseUrl ?? siteUrl)();
  const email = deps.email ?? sendEmail;
  const whatsapp = deps.whatsapp ?? sendWhatsApp;
  const sleep = deps.sleep ?? defaultSleep;
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const pick = { whatsappToPhone: settings.whatsappToPhone, channels: active };
  let whatsappSent = false;

  for (const row of rows) {
    if (clock() - startedAt > budgetMs) break;
    if (emailLeft <= 0) active.email = false;
    if (whatsappLeft <= 0) active.whatsapp = false;
    if (!active.email && !active.whatsapp) break;

    const wanted = pickChannels(row, pick);
    if (wanted.length === 0) continue;
    const prospect = toProspect(row);
    const input = {
      previewUrl: previewUrlOf(baseUrl, row.token),
      prices,
      nicheTitle: nicheTitle(row.niche),
      replyTo: settings.replyTo,
    };
    const sentAt = new Date();
    const success = {
      status: 'CONTACTED',
      outreachError: null,
      ...(row.contactedAt ? {} : { contactedAt: sentAt }),
    };

    if (wanted.includes('email') && row.email) {
      const letter = buildEmail(prospect, input);
      const sent = await withTimeout(
        email({
          to: row.email,
          subject: letter.subject,
          html: letter.html,
          text: letter.text,
          ...(settings.replyTo.trim() ? { headers: { 'Reply-To': settings.replyTo.trim() } } : {}),
        }),
        SEND_TIMEOUT_MS,
        'Почта',
      ).catch((error: unknown) => ({
        skipped: false as const,
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (!sent.skipped && sent.ok) {
        emailLeft -= 1;
        result.email += 1;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: { ...success, emailSentAt: sentAt },
        });
      } else {
        result.errors += 1;
        const reason = sent.skipped ? sent.reason : sent.error;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: { outreachError: outreachErrorText('email', reason) },
        });
      }
    }

    if (wanted.includes('whatsapp')) {
      const target = whatsappTarget(row, pick);
      if (target) {
        if (whatsappSent) await sleep(pauseMs());
        whatsappSent = true;
        const sent = await withTimeout(
          whatsapp(target, buildWhatsAppText(prospect, input)),
          SEND_TIMEOUT_MS,
          'WhatsApp',
        ).catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }));
        if (sent.ok) {
          whatsappLeft -= 1;
          result.whatsapp += 1;
          await db.prospect.updateMany({
            where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
            data: { ...success, whatsappSentAt: new Date() },
          });
        } else {
          result.errors += 1;
          await db.prospect.updateMany({
            where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
            data: { outreachError: outreachErrorText('whatsapp', sent.error) },
          });
        }
      }
    }
  }
  return result;
}

/** Статусы, в которых ответ кандидата ещё что-то значит. */
const REPLY_STATUSES = ['CONTACTED', 'READY', 'CALLBACK'];

/**
 * Входящее сообщение WhatsApp от кандидата (вебхук Green API): отмечает `repliedAt`
 * у кандидата с таким номером WhatsApp или телефоном; «стоп» → DECLINED.
 */
export async function markReplied(
  fromPhoneDigits: string,
  text: string,
  now: Date,
  db: OutreachDb = prisma,
): Promise<{ matched: boolean; stopped: boolean }> {
  const digits = fromPhoneDigits.replace(/\D/g, '');
  if (digits.length < 10) return { matched: false, stopped: false };
  const tail = digits.slice(-10);
  // Phones are stored as «+7XXXXXXXXXX» (lib/office/sources/phone.ts), so the last ten
  // digits match both the WhatsApp number and the card phone.
  const rows = await db.prospect.findMany({
    where: {
      status: { in: REPLY_STATUSES },
      OR: [{ whatsapp: { endsWith: tail } }, { phone: { endsWith: tail } }],
    },
    orderBy: { contactedAt: 'desc' },
    take: 5,
  });
  if (rows.length === 0) return { matched: false, stopped: false };
  const stopped = isStopReply(text);
  for (const row of rows) {
    await db.prospect.update({
      where: { id: row.id },
      data: {
        repliedAt: now,
        ...(stopped ? { status: 'DECLINED', declinedAt: now } : {}),
      },
    });
  }
  return { matched: true, stopped };
}
