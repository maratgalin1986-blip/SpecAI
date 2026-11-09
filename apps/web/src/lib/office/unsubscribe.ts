// «Больше не писать» (К3, docs/business/sajty-pod-klyuch.md, § 9.1 п. 5): в каждом холодном
// письме офиса — ссылка отписки и заголовок List-Unsubscribe (RFC 8058). Ссылка —
// /otpiska/<token>?s=<HMAC от token>; token — секрет превью кандидата, подпись — от
// CRON_SECRET или NEXTAUTH_SECRET, чтобы по одному токену нельзя было отписать чужого.
// Открытие страницы ничего не меняет (почтовые сканеры открывают ссылки сами): отписывает
// только POST — кнопка на странице или почтовый клиент по List-Unsubscribe-Post.
// Отписка ставит optOutAt (навсегда) и переводит кандидата в DECLINED; рассылка не пишет на
// адрес, если хоть у одной строки с таким же e-mail есть optOutAt (у обоих агентов).
import { createHmac, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'office-optout:v1';
/** Токен превью — 32 шестнадцатеричных знака (slug.ts newToken); старые — тоже короткие. */
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Статусы, из которых отписка переводит в DECLINED; клиенты (AGREED, PUBLISHED) остаются. */
export const OPT_OUT_DECLINE_STATUSES: readonly string[] = [
  'NEW',
  'READY',
  'CONTACTED',
  'CALLBACK',
];

type Env = Record<string, string | undefined>;

function secretOf(env: Env): string | null {
  for (const key of ['CRON_SECRET', 'NEXTAUTH_SECRET']) {
    const secret = env[key];
    if (secret && secret.trim()) return secret;
  }
  return null;
}

/** Есть ли чем подписывать ссылки: без этого холодные письма не уходят. */
export function unsubscribeConfigured(env: Env = process.env): boolean {
  return secretOf(env) !== null;
}

/** Подпись токена; null — токен странный или секрета нет. */
export function unsubscribeSignature(token: string, env: Env = process.env): string | null {
  const secret = secretOf(env);
  if (!secret || !TOKEN_RE.test(token)) return null;
  return createHmac('sha256', secret).update(`${PURPOSE}:${token}`).digest('base64url');
}

/** Подпись верна: токен тот, что был в письме. */
export function verifyUnsubscribe(token: unknown, signature: unknown, env: Env = process.env) {
  if (typeof token !== 'string' || typeof signature !== 'string') return false;
  if (signature.length > 100) return false;
  const expected = unsubscribeSignature(token, env);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface UnsubscribeLinks {
  /** Страница с кнопкой «Больше не писать» (для человека). */
  page: string;
  /** Адрес для почтовых клиентов: POST List-Unsubscribe=One-Click. */
  oneClick: string;
}

/** Ссылки отписки для письма; null — нечем подписать (письмо тогда не уходит). */
export function unsubscribeLinks(
  baseUrl: string,
  token: string,
  env: Env = process.env,
): UnsubscribeLinks | null {
  const s = unsubscribeSignature(token, env);
  if (!s) return null;
  const base = baseUrl.replace(/\/+$/, '');
  const t = encodeURIComponent(token);
  const sig = encodeURIComponent(s);
  return {
    page: `${base}/otpiska/${t}?s=${sig}`,
    oneClick: `${base}/api/office/unsubscribe?t=${t}&s=${sig}`,
  };
}

/** Заголовки письма по RFC 8058: отписка в один клик из почтового клиента. */
export function unsubscribeHeaders(links: UnsubscribeLinks): Record<string, string> {
  return {
    'List-Unsubscribe': `<${links.oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Ровно те запросы к Prospect, что делает отписка (prisma подходит структурно). */
export interface OptOutDb {
  prospect: {
    findUnique(args: {
      where: { token: string };
      select: { id: true; status: true; optOutAt: true };
    }): Promise<{ id: string; status: string; optOutAt: Date | null } | null>;
    update(args: {
      where: { id: string };
      data: { optOutAt?: Date; status?: string; declinedAt?: Date };
    }): Promise<unknown>;
  };
}

/**
 * Отписка по токену: optOutAt (если ещё нет), DECLINED и declinedAt для тех, кто ещё в
 * воронке. Повторная отписка — тоже успех. false — такого кандидата нет.
 */
export async function optOutByToken(token: string, now: Date, db: OptOutDb): Promise<boolean> {
  const row = await db.prospect.findUnique({
    where: { token },
    select: { id: true, status: true, optOutAt: true },
  });
  if (!row) return false;
  const decline = OPT_OUT_DECLINE_STATUSES.includes(row.status);
  if (row.optOutAt && !decline) return true;
  await db.prospect.update({
    where: { id: row.id },
    data: {
      ...(row.optOutAt ? {} : { optOutAt: now }),
      ...(decline ? { status: 'DECLINED', declinedAt: now } : {}),
    },
  });
  return true;
}

/** Адрес почты для сравнения: без пробелов, в нижнем регистре. */
export function emailKey(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Запрос «у каких из этих адресов есть отписка» (prisma подходит структурно). */
export interface OptedOutDb {
  prospect: {
    findMany(args: {
      where: { optOutAt: { not: null }; email: { in: string[]; mode: 'insensitive' } };
      select: { email: true };
      orderBy: { optOutAt: 'asc' };
      take: number;
    }): Promise<{ email: string | null }[]>;
  };
}

/** Какие из адресов отписаны (хоть у одной строки с таким e-mail есть optOutAt). */
export async function optedOutEmails(
  emails: readonly (string | null | undefined)[],
  db: OptedOutDb,
): Promise<Set<string>> {
  const keys = [...new Set(emails.map(emailKey).filter((e) => e.length > 0))];
  if (keys.length === 0) return new Set();
  const rows = await db.prospect.findMany({
    where: { optOutAt: { not: null }, email: { in: keys, mode: 'insensitive' } },
    select: { email: true },
    orderBy: { optOutAt: 'asc' },
    take: keys.length * 5,
  });
  return new Set(rows.map((r) => emailKey(r.email)).filter((e) => e.length > 0));
}
