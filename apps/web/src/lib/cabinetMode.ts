// One login, two modes (owner, 2026-10-17): a provider company's admin also
// orders machinery as a customer. The last mode is remembered in a cookie, so
// the header's «Кабинет» leads back to it; ?mode= in the address wins over the
// cookie. Customers, operators and the platform admin have one mode only.
// Plain functions: used by server pages and client components, unit-tested.

import { isProvider } from './fleet';

export type CabinetMode = 'customer' | 'provider';

export const MODE_COOKIE = 'sp_mode';
/** A year: the choice is a convenience, not a secret. */
export const MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const CUSTOMER_MODE_HREF = '/dashboard?mode=customer';
export const PROVIDER_MODE_HREF = '/provider';

interface ModeUser {
  role?: string | null;
  companyId?: string | null;
}

export function parseMode(value: unknown): CabinetMode | null {
  return value === 'customer' || value === 'provider' ? value : null;
}

/** Only a provider company's admin switches between ordering and working. */
export function canSwitchModes(user: ModeUser | null | undefined): boolean {
  return isProvider(user);
}

/**
 * The mode a page shows: the address (?mode=) first, then the remembered
 * choice, then the account's own mode (a provider works by default).
 */
export function cabinetMode(
  user: ModeUser | null | undefined,
  param?: unknown,
  cookie?: unknown,
): CabinetMode {
  if (!canSwitchModes(user)) return 'customer';
  return parseMode(param) ?? parseMode(cookie) ?? 'provider';
}

/**
 * Where /dashboard sends this visitor: a provider in its working mode goes to
 * its own page, everyone else stays (null).
 */
export function dashboardRedirect(
  user: ModeUser | null | undefined,
  param?: unknown,
  cookie?: unknown,
): string | null {
  return cabinetMode(user, param, cookie) === 'provider' ? PROVIDER_MODE_HREF : null;
}

/** The header's «Кабинет»: the last mode of a provider, the dashboard for the rest. */
export function cabinetHref(user: ModeUser | null | undefined, cookie?: unknown): string {
  if (!canSwitchModes(user)) return '/dashboard';
  return cabinetMode(user, undefined, cookie) === 'customer'
    ? CUSTOMER_MODE_HREF
    : PROVIDER_MODE_HREF;
}

/** document.cookie value that remembers the mode for a year. */
export function modeCookie(mode: CabinetMode): string {
  return `${MODE_COOKIE}=${mode}; Path=/; Max-Age=${MODE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** The remembered mode from a Cookie header / document.cookie string. */
export function readModeCookie(cookieHeader: string | null | undefined): CabinetMode | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === MODE_COOKIE) return parseMode(rest.join('='));
  }
  return null;
}
