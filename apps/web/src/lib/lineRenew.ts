// «Продлить на 5 рабочих дней?» (owner, 2026-10-28): a day before a standing
// line runs out, the provider gets a one-tap link (push, Telegram, e-mail —
// the channels he already has). The link carries a signed token for that
// presence row and that period only, so it works without signing in and
// cannot renew a later period or another provider's line. Opening the link
// changes nothing (mail scanners open links first): the page has one button.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PURPOSE = 'line-renew:v1';
const ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const LINE_RENEW_PATH = '/line/prodlit';

function tokenSecret(override?: string): string | null {
  const secret = override ?? process.env.NEXTAUTH_SECRET;
  return secret && secret.trim() ? secret : null;
}

function signature(presenceId: string, untilMs: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_PURPOSE}:${presenceId}:${untilMs}`)
    .digest('base64url');
}

/** `<base64url(presenceId)>.<untilMs>.<HMAC>`; null without NEXTAUTH_SECRET. */
export function lineRenewToken(
  presenceId: string,
  until: Date,
  secretOverride?: string,
): string | null {
  const secret = tokenSecret(secretOverride);
  if (!secret || !ROW_ID.test(presenceId)) return null;
  const untilMs = until.getTime();
  return `${Buffer.from(presenceId, 'utf8').toString('base64url')}.${untilMs}.${signature(presenceId, untilMs, secret)}`;
}

/** The row and the period end of a valid token; null for anything forged, cut or tampered with. */
export function verifyLineRenewToken(
  token: unknown,
  secretOverride?: string,
): { presenceId: string; untilMs: number } | null {
  if (typeof token !== 'string' || token.length > 300) return null;
  const secret = tokenSecret(secretOverride);
  if (!secret) return null;
  const [encoded, rawUntil, given, extra] = token.split('.');
  if (!encoded || !rawUntil || !given || extra !== undefined) return null;
  if (!/^\d{1,16}$/.test(rawUntil)) return null;
  const presenceId = Buffer.from(encoded, 'base64url').toString('utf8');
  if (!ROW_ID.test(presenceId)) return null;
  const untilMs = Number(rawUntil);
  const expected = Buffer.from(signature(presenceId, untilMs, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { presenceId, untilMs };
}

export function lineRenewPath(token: string): string {
  return `${LINE_RENEW_PATH}?t=${encodeURIComponent(token)}`;
}
