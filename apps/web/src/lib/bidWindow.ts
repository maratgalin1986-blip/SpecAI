// How long providers are asked to bid on an order (Order.bidsUntil), like the
// countdown on a taxi driver's incoming-order card. Pure, unit-tested.
import { moscowDateKey } from './bookingRules';

const HOUR = 3_600_000;
/** «Нужна сейчас» (the work starts today): two hours to bid. */
export const URGENT_BID_WINDOW_MS = 2 * HOUR;
/** A preorder: a day to bid, but not past the start date. */
export const PREORDER_BID_WINDOW_MS = 24 * HOUR;

/**
 * The bid deadline of an order created at `createdAt` for work starting on
 * `desiredStartDate`: +2 h when the work starts today (Moscow), otherwise
 * +24 h capped at the start date — never less than two hours.
 */
export function bidsUntilFor(createdAt: Date, desiredStartDate: Date): Date {
  const urgent = moscowDateKey(desiredStartDate) <= moscowDateKey(createdAt);
  const soonest = new Date(createdAt.getTime() + URGENT_BID_WINDOW_MS);
  if (urgent) return soonest;
  const dayLater = new Date(createdAt.getTime() + PREORDER_BID_WINDOW_MS);
  const capped = dayLater.getTime() < desiredStartDate.getTime() ? dayLater : desiredStartDate;
  return capped.getTime() < soonest.getTime() ? soonest : capped;
}

/** Whether a bid placed at `at` is after the order's deadline. */
export function isLateBid(bidsUntil: Date | null | undefined, at: Date = new Date()): boolean {
  return Boolean(bidsUntil) && at.getTime() > (bidsUntil as Date).getTime();
}

/** «осталось 1 ч 20 мин», «осталось 45 мин» or null once the window is over. */
export function bidsLeftText(bidsUntil: Date | null | undefined, now: Date = new Date()) {
  if (!bidsUntil) return null;
  const left = bidsUntil.getTime() - now.getTime();
  if (left <= 0) return null;
  const minutes = Math.ceil(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `осталось ${days} дн ${hours % 24} ч`;
  }
  if (hours > 0) return `осталось ${hours} ч${rest > 0 ? ` ${rest} мин` : ''}`;
  return `осталось ${minutes} мин`;
}
