// Trust signals of a provider company, derived from data the service already
// has: the admin's «Проверен» mark, completed bookings, the share of cancelled
// bookings, the average rating and how many colleagues it invited. Shown on
// offer cards, the provider's public page and its cabinet. Pure functions,
// unit-tested; lib/companyStats.ts loads the numbers.

import { CANCELLED_BY, type CancelledBy } from '@specai/shared';
import { recommendsNote } from './referral';

export interface CompanyStats {
  verified: boolean;
  /** Bookings by status for the company's machinery. */
  bookings: Partial<Record<string, number>>;
  /**
   * Cancelled bookings by who cancelled them (Booking.cancelledBy). Bookings
   * cancelled before the column existed have no entry here.
   */
  cancelledBy?: Partial<Record<CancelledBy, number>>;
  ratingSum: number;
  ratingCount: number;
  /** Providers this company's users invited (lib/referral.ts). */
  invitedProviders?: number;
}

export interface Reliability {
  verified: boolean;
  completed: number;
  /**
   * Bookings the provider itself cancelled among all decided ones, 0..1; null
   * below MIN_SAMPLE. The customer's cancellations are not held against it.
   */
  cancelShare: number | null;
  /** Average stars, one decimal; null without reviews. */
  rating: number | null;
  ratingCount: number;
  /** Short chips for a card, in the order they matter. */
  badges: string[];
  recommends: string | null;
}

/** Below this many decided bookings the cancellation share says nothing. */
export const MIN_SAMPLE = 3;

export const EMPTY_STATS: CompanyStats = {
  verified: false,
  bookings: {},
  cancelledBy: {},
  ratingSum: 0,
  ratingCount: 0,
  invitedProviders: 0,
};

const count = (value: number | undefined) => (value && value > 0 ? value : 0);

/**
 * The share of bookings cancelled by `who` among the decided ones, 0..1; null
 * below MIN_SAMPLE. The provider's reliability counts PROVIDER cancellations.
 * A booking another party cancelled (the customer, the admin) counts as kept:
 * the provider kept its word, so a customer's cancellation never raises the
 * provider's share. Legacy rows with `cancelledBy` null (cancelled before the
 * column existed) stay out: nobody knows who cancelled them.
 */
export function cancellationShare(stats: CompanyStats, who: CancelledBy): number | null {
  const cancelled = count(stats.cancelledBy?.[who]);
  // Waiting bookings (PENDING) are not decided yet; confirmed and active ones
  // already count as kept.
  const byOthers = Object.entries(stats.cancelledBy ?? {}).reduce(
    (sum, [party, n]) => (party === who ? sum : sum + count(n)),
    0,
  );
  const kept =
    count(stats.bookings.COMPLETED) +
    count(stats.bookings.CONFIRMED) +
    count(stats.bookings.ACTIVE) +
    byOthers;
  const decided = kept + cancelled;
  return decided >= MIN_SAMPLE ? cancelled / decided : null;
}

export function reliability(stats: CompanyStats): Reliability {
  const completed = count(stats.bookings.COMPLETED);
  const cancelShare = cancellationShare(stats, CANCELLED_BY.PROVIDER);
  const rating =
    stats.ratingCount > 0 ? Math.round((stats.ratingSum / stats.ratingCount) * 10) / 10 : null;

  const badges: string[] = [];
  if (stats.verified) badges.push('Проверен');
  if (rating !== null) badges.push(`★ ${rating.toFixed(1)} (${stats.ratingCount})`);
  if (completed > 0) badges.push(`${completed} ${completedWord(completed)}`);
  if (cancelShare !== null) badges.push(cancelLabel(cancelShare));
  if (badges.length === 0 || (!stats.verified && completed === 0 && rating === null)) {
    badges.push('Новый на сервисе');
  }

  return {
    verified: stats.verified,
    completed,
    cancelShare,
    rating,
    ratingCount: stats.ratingCount,
    badges,
    recommends: recommendsNote(stats.invitedProviders ?? 0),
  };
}

function completedWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заказ выполнен';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'заказа выполнено';
  return 'заказов выполнено';
}

/** «Без отмен» / «Отмены 12%». */
export function cancelLabel(share: number): string {
  if (share <= 0) return 'Без отмен';
  return `Отмены ${Math.round(share * 100)}%`;
}

export type BookingTally = Pick<CompanyStats, 'bookings' | 'cancelledBy'>;

const CANCELLED_BY_VALUES: readonly string[] = Object.values(CANCELLED_BY);
const isCancelledBy = (value: string | null | undefined): value is CancelledBy =>
  typeof value === 'string' && CANCELLED_BY_VALUES.includes(value);

/**
 * Bookings grouped by company id → stats input (rows from lib/companyStats.ts):
 * counts by status, and cancelled ones also by who cancelled.
 */
export function tallyBookings(
  rows: { status: string; companyId: string; cancelledBy?: string | null }[],
): Map<string, BookingTally> {
  const result = new Map<string, BookingTally>();
  for (const row of rows) {
    const tally = result.get(row.companyId) ?? { bookings: {}, cancelledBy: {} };
    tally.bookings[row.status] = (tally.bookings[row.status] ?? 0) + 1;
    if (row.status === 'CANCELLED' && isCancelledBy(row.cancelledBy)) {
      tally.cancelledBy![row.cancelledBy] = (tally.cancelledBy![row.cancelledBy] ?? 0) + 1;
    }
    result.set(row.companyId, tally);
  }
  return result;
}
