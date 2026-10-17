import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

// The admin area (callback requests) is protected by a single password set in
// the ADMIN_PASSWORD environment variable. Without it the admin area is off.
export const ADMIN_COOKIE = 'sp16_admin';
/** The app sends the same session value in this header (no cookies there). */
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
    return sameSession(headers().get(ADMIN_HEADER), expected);
  } catch {
    return false;
  }
}
