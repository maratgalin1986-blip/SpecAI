// «Больше не писать» (К3, docs/business/sajty-pod-klyuch.md, § 9.1 п. 5): в каждом холодном
// письме офиса — ссылка отписки и заголовок List-Unsubscribe (RFC 8058). Ссылка —
// /otpiska/<token>?s=<HMAC от token>; token — секрет превью кандидата, подпись — от
// CRON_SECRET или NEXTAUTH_SECRET, чтобы по одному токену нельзя было отписать чужого.
// Открытие страницы ничего не меняет (почтовые сканеры открывают ссылки сами): отписывает
// только POST — кнопка на странице или почтовый клиент по List-Unsubscribe-Post.
// Отписка ставит optOutAt (навсегда) и переводит кандидата в DECLINED; рассылка не пишет ни на
// адрес, ни на номер, если хоть у одной строки с таким же e-mail, телефоном или WhatsApp есть
// optOutAt (у обоих агентов). optOutAt ставят и «стоп» в WhatsApp, и «Отказ» владельца.
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

type OptOutMatch =
  | { email: { in: string[]; mode: 'insensitive' } }
  | { phone: { in: string[] } }
  | { whatsapp: { in: string[] } };

/** Запрос «у каких из этих адресов и номеров есть отписка» (prisma подходит структурно). */
export interface OptedOutDb {
  prospect: {
    findMany(args: {
      where: { optOutAt: { not: null }; OR: OptOutMatch[] };
      select: { email: true; phone: true; whatsapp: true };
      orderBy: { optOutAt: 'asc' };
      take: number;
    }): Promise<{ email: string | null; phone: string | null; whatsapp: string | null }[]>;
  };
}

/** Отписанные контакты: адреса почты (emailKey) и номера в том виде, как их хранит Prospect. */
export interface OptedOutContacts {
  emails: Set<string>;
  phones: Set<string>;
}

/**
 * Какие контакты отписаны. Отписка, «стоп» и «Отказ» владельца ставят optOutAt на строку; её
 * адрес почты, телефон и WhatsApp не получают больше ничего ни в каком канале — даже если ту же
 * фирму нашёл другой агент или другой прогон (номер +7…, как его пишет sources/phone.ts).
 */
export async function optedOutContacts(
  emails: readonly (string | null | undefined)[],
  phones: readonly (string | null | undefined)[],
  db: OptedOutDb,
): Promise<OptedOutContacts> {
  const emailKeys = [...new Set(emails.map(emailKey).filter((e) => e.length > 0))];
  const phoneKeys = [...new Set(phones.map((p) => (p ?? '').trim()).filter((p) => p.length > 0))];
  const out: OptedOutContacts = { emails: new Set(), phones: new Set() };
  if (emailKeys.length === 0 && phoneKeys.length === 0) return out;
  const or: OptOutMatch[] = [];
  if (emailKeys.length > 0) or.push({ email: { in: emailKeys, mode: 'insensitive' } });
  if (phoneKeys.length > 0) or.push({ phone: { in: phoneKeys } }, { whatsapp: { in: phoneKeys } });
  const rows = await db.prospect.findMany({
    where: { optOutAt: { not: null }, OR: or },
    select: { email: true, phone: true, whatsapp: true },
    orderBy: { optOutAt: 'asc' },
    take: (emailKeys.length + phoneKeys.length) * 5,
  });
  for (const row of rows) {
    const e = emailKey(row.email);
    if (e) out.emails.add(e);
    for (const phone of [row.phone, row.whatsapp]) {
      const p = (phone ?? '').trim();
      if (p) out.phones.add(p);
    }
  }
  return out;
}
