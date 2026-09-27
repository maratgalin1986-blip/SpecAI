import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// The admin area (callback requests) is protected by a single password set in
// the ADMIN_PASSWORD environment variable. Without it the admin area is off.
export const ADMIN_COOKIE = 'sp16_admin';

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

export function isAdminRequest() {
  const expected = adminSessionValue();
  const actual = cookies().get(ADMIN_COOKIE)?.value;
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
