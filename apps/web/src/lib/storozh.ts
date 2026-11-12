// «Сторож» (owner, 2026-11-08: «максимально человека оставлять на сайте»):
// decides WHEN Иван from logistics may ask a visitor who is about to leave
// one short question. Pure: the component (components/Storozh.tsx) feeds it
// events and storage, this file holds the rules and is unit-tested.

export type StorozhTrigger = 'mouse-exit' | 'scroll-back' | 'tab-return';

/** Desktop: the mouse leaves through the top edge after this long on the page. */
export const STOROZH_DESKTOP_MS = 20_000;
/** Phones: a fast scroll back up or a tab return after this long on the page. */
export const STOROZH_MOBILE_MS = 25_000;
/** The visitor must have read at least this share of the page before a scroll-back counts. */
export const STOROZH_SCROLL_DEPTH = 0.4;
/** Upward scroll speed (px per ms) that reads as «heading for the address bar». */
export const STOROZH_SCROLL_SPEED = 1.2;
/** «Нет, спасибо» keeps Сторож quiet for a week (like the cookie strip's ✕). */
export const STOROZH_SNOOZE_MS = 7 * 86_400_000;

export const STOROZH_SNOOZE_KEY = 'storozh-snooze';
/** Set by submitLead when a lead went through: Сторож never asks a customer twice. */
export const LEAD_SENT_KEY = 'lead-sent';

/** Pages where Сторож never speaks (the owner's and legal pages, the film). */
export const STOROZH_EXCLUDED = [
  '/admin',
  '/provider',
  '/dashboard',
  '/privacy',
  '/soglasie',
  '/stroyka',
];

/** Сторож works on the home page, the machine pages and their city pages. */
export function storozhPathAllowed(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (STOROZH_EXCLUDED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return false;
  return pathname === '/' || pathname === '/uborka-snega' || pathname.startsWith('/arenda/');
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Why Сторож must stay quiet for this visitor, or null when it may speak. */
export function storozhBlockedReason(
  storage: StorageLike | null,
  now = Date.now(),
): 'lead-sent' | 'snoozed' | null {
  if (read(storage, LEAD_SENT_KEY)) return 'lead-sent';
  const until = Number(read(storage, STOROZH_SNOOZE_KEY));
  if (until && now < until) return 'snoozed';
  return null;
}

export function snoozeStorozh(storage: StorageLike | null, now = Date.now()) {
  try {
    storage?.setItem(STOROZH_SNOOZE_KEY, String(now + STOROZH_SNOOZE_MS));
  } catch {
    // Storage blocked: quiet for this page view only.
  }
}

export function markLeadSent(storage: StorageLike | null, now = Date.now()) {
  try {
    storage?.setItem(LEAD_SENT_KEY, String(now));
  } catch {
    // Storage blocked: the «once per page view» rule still holds.
  }
}

export interface StorozhState {
  loadedAt: number;
  /** Deepest point read so far, 0..1 (bottom of the viewport / page height). */
  maxDepth: number;
  lastScroll: { y: number; at: number } | null;
  tabHidden: boolean;
  fired: boolean;
}

export function createStorozhState(loadedAt = Date.now()): StorozhState {
  return { loadedAt, maxDepth: 0, lastScroll: null, tabHidden: false, fired: false };
}

function fire(state: StorozhState, trigger: StorozhTrigger): StorozhTrigger {
  state.fired = true;
  return trigger;
}

/** Desktop: the pointer left the page through the top edge (toward the tabs). */
export function onMouseLeave(state: StorozhState, clientY: number, now = Date.now()) {
  if (state.fired || clientY > 0) return null;
  if (now - state.loadedAt < STOROZH_DESKTOP_MS) return null;
  return fire(state, 'mouse-exit');
}

/**
 * Phones: after reading ≥40% of the page the visitor flicks back up fast —
 * usually to the address bar or the back button.
 */
export function onScroll(
  state: StorozhState,
  scrollY: number,
  pageHeight: number,
  viewportHeight: number,
  now = Date.now(),
) {
  const depth = pageHeight > 0 ? Math.min(1, (scrollY + viewportHeight) / pageHeight) : 0;
  if (depth > state.maxDepth) state.maxDepth = depth;
  const last = state.lastScroll;
  state.lastScroll = { y: scrollY, at: now };
  if (state.fired || !last) return null;
  const elapsed = now - last.at;
  if (elapsed <= 0 || elapsed > 400) return null;
  const speed = (last.y - scrollY) / elapsed;
  if (speed < STOROZH_SCROLL_SPEED) return null;
  if (state.maxDepth < STOROZH_SCROLL_DEPTH) return null;
  if (now - state.loadedAt < STOROZH_MOBILE_MS) return null;
  return fire(state, 'scroll-back');
}

/** Phones: the tab went to the background and came back. */
export function onVisibilityChange(state: StorozhState, hidden: boolean, now = Date.now()) {
  if (hidden) {
    state.tabHidden = true;
    return null;
  }
  if (state.fired || !state.tabHidden) return null;
  if (now - state.loadedAt < STOROZH_MOBILE_MS) return null;
  return fire(state, 'tab-return');
}
