/**
 * When the «Поддержать ИИСтройка24» card shows after a completed booking: the
 * offer is on, and among the completed bookings on screen there is one the
 * person has not closed yet («Не сейчас» or the card number copied). Closed
 * booking ids are remembered in this browser only.
 */
export const SUPPORT_DISMISSED_KEY = 'sp16.supportDismissed';

/** Completed bookings looked at (the newest ones in the list). */
export const SUPPORT_TRACKED = 30;
/** Closed ids kept: enough for the tracked ones, small for storage. */
export const SUPPORT_KEEP = 60;

type BookingLike = { id: string; status: string };

/** The completed bookings that count for the offer, in list order. */
export function completedBookingIds(bookings: readonly BookingLike[]): string[] {
  return bookings
    .filter((booking) => booking.status === 'COMPLETED')
    .slice(0, SUPPORT_TRACKED)
    .map((booking) => booking.id);
}

export function parseDismissedIds(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length <= 64)
      : [];
  } catch {
    return [];
  }
}

export function shouldOfferSupport(
  enabled: boolean,
  completedIds: readonly string[],
  dismissed: readonly string[],
): boolean {
  if (!enabled) return false;
  const closed = new Set(dismissed);
  return completedIds.some((id) => !closed.has(id));
}

/** The new closed ids go first; the oldest fall off past SUPPORT_KEEP. */
export function withDismissed(dismissed: readonly string[], ids: readonly string[]): string[] {
  return [...new Set([...ids, ...dismissed])].slice(0, SUPPORT_KEEP);
}

export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDismissedIds(storage: KeyValueStorage | null = browserStorage()): string[] {
  try {
    return parseDismissedIds(storage?.getItem(SUPPORT_DISMISSED_KEY));
  } catch {
    return [];
  }
}

/** Remember the closed ids; a blocked storage only means the card may show again. */
export function rememberDismissedIds(
  ids: readonly string[],
  storage: KeyValueStorage | null = browserStorage(),
): string[] {
  const next = withDismissed(readDismissedIds(storage), ids);
  try {
    storage?.setItem(SUPPORT_DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: nothing else to do.
  }
  return next;
}

export type PublicSupportInfo =
  | { enabled: false }
  | { enabled: true; card: string; recipient: string | null; amounts?: readonly number[] };

/** The /api/support answer, checked: anything unexpected means «off». */
export function parsePublicSupport(body: unknown): PublicSupportInfo {
  if (!body || typeof body !== 'object') return { enabled: false };
  const value = body as Record<string, unknown>;
  if (
    value.enabled !== true ||
    typeof value.card !== 'string' ||
    !/^[\d ]{16,23}$/.test(value.card)
  )
    return { enabled: false };
  return {
    enabled: true,
    card: value.card,
    recipient: typeof value.recipient === 'string' && value.recipient ? value.recipient : null,
    amounts: Array.isArray(value.amounts)
      ? value.amounts.filter((n): n is number => Number.isInteger(n) && n > 0)
      : [],
  };
}

let cached: Promise<PublicSupportInfo> | null = null;

/** One request per page view; a failed one is retried next time. */
export function fetchPublicSupport(): Promise<PublicSupportInfo> {
  cached ??= fetch('/api/support')
    .then((response) => (response.ok ? response.json() : null))
    .then(parsePublicSupport)
    .catch(() => {
      cached = null;
      return { enabled: false } as const;
    });
  return cached;
}
