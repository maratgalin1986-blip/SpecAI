import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

// The admin area (callback requests) is protected by a single password set in
// the ADMIN_PASSWORD environment variable. Without it the admin area is off.
export const ADMIN_COOKIE = 'sp16_admin';
/** The app sends its admin session (issueAdminAppToken) in this header. */
export const ADMIN_HEADER = 'x-admin-session';

function sessionToken(password: string) {
  return createHash('sha256')
    .update(`${password}:${process.env.NEXTAUTH_SECRET ?? ''}`)
    .digest('hex');
}

export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkAdminPassword(candidate: string) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const a = Buffer.from(sessionToken(candidate));
  const b = Buffer.from(sessionToken(password));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminSessionValue() {
  const password = process.env.ADMIN_PASSWORD;
  return password ? sessionToken(password) : null;
}

/** How long the app's admin session lives (the site's cookie: the same). */
export const ADMIN_APP_TTL_SEC = 14 * 24 * 60 * 60;

function appSignature(expiresAt: number, password: string) {
  return createHmac('sha256', sessionToken(password))
    .update(`admin-app:${expiresAt}`)
    .digest('hex');
}

/**
 * The app's admin session: «v1.<expiry>.<signature>». It expires after
 * ADMIN_APP_TTL_SEC and stops working at once when ADMIN_PASSWORD (or
 * NEXTAUTH_SECRET) changes; it never contains the password or the cookie value.
 */
export function issueAdminAppToken(nowSec: number = Math.floor(Date.now() / 1000)) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  const expiresAt = nowSec + ADMIN_APP_TTL_SEC;
  return `v1.${expiresAt}.${appSignature(expiresAt, password)}`;
}

export function isValidAdminAppToken(
  token: string | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !token) return false;
  const match = /^v1\.(\d{9,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!(expiresAt > nowSec) || expiresAt > nowSec + ADMIN_APP_TTL_SEC) return false;
  return sameSession(match[2], appSignature(expiresAt, password));
}

function sameSession(actual: string | null | undefined, expected: string) {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signed in to the admin area: the site's cookie or the app's header. */
export function isAdminRequest() {
  const expected = adminSessionValue();
  if (!expected) return false;
  if (sameSession(cookies().get(ADMIN_COOKIE)?.value, expected)) return true;
  try {
    return isValidAdminAppToken(headers().get(ADMIN_HEADER));
  } catch {
    return false;
  }
}
