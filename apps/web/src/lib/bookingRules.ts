/**
 * Pure booking rules shared by the booking and bid routes: calendar dates in
 * Moscow time, inclusive day counts and overlap checks. No database access
 * here, so everything is unit-tested in bookingRules.test.ts.
 */

export const BOOKING_TIME_ZONE = 'Europe/Moscow';
export const MAX_BOOKING_DAYS = 90;
const DAY_MS = 86_400_000;

/** Statuses that hold the machine: a new booking may not overlap them. */
export const BLOCKING_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'ACTIVE'] as const;
/** Statuses that mean the machine is really promised to someone. */
export const CONFIRMED_BOOKING_STATUSES = ['CONFIRMED', 'ACTIVE'] as const;

const moscowDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOOKING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date of an instant in Moscow, as "YYYY-MM-DD". */
export function moscowDateKey(date: Date): string {
  return moscowDateFormat.format(date);
}

/**
 * The calendar day (in Moscow) an instant falls on, as UTC midnight of that
 * day. "2028-03-01" and "2028-02-29T21:00:00Z" (Moscow midnight) both give
 * 2028-03-01T00:00:00Z, so dates from the site and the app compare equal.
 */
export function toBookingDay(date: Date): Date {
  return new Date(`${moscowDateKey(date)}T00:00:00.000Z`);
}

/** Number of rental days, both ends included: 1–1 March is 1 day, 1–3 March is 3. */
export function bookingDays(start: Date, end: Date): number {
  return Math.round((toBookingDay(end).getTime() - toBookingDay(start).getTime()) / DAY_MS) + 1;
}

/** Two inclusive date ranges share at least one day. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

export type BookingDatesResult =
  { ok: true; startDate: Date; endDate: Date; days: number } | { ok: false; error: string };

/**
 * Validates the dates of a new booking: start not in the past (today in
 * Moscow is fine), end not before start, at most MAX_BOOKING_DAYS days.
 * Returns the dates normalised to calendar days.
 */
export function checkBookingDates(
  start: Date,
  end: Date,
  now: Date = new Date(),
): BookingDatesResult {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Укажите даты начала и окончания аренды' };
  }
  const startDate = toBookingDay(start);
  const endDate = toBookingDay(end);
  if (startDate.getTime() < toBookingDay(now).getTime()) {
    return { ok: false, error: 'Дата начала уже прошла — выберите сегодня или позже' };
  }
  if (endDate.getTime() < startDate.getTime()) {
    return { ok: false, error: 'Дата окончания не может быть раньше даты начала' };
  }
  const days = bookingDays(startDate, endDate);
  if (days > MAX_BOOKING_DAYS) {
    return {
      ok: false,
      error: `Бронировать можно не больше чем на ${MAX_BOOKING_DAYS} дней. Для долгой аренды позвоните нам`,
    };
  }
  return { ok: true, startDate, endDate, days };
}

/** Message for equipment that cannot be booked or offered right now. */
export function unavailableEquipmentMessage(status: string): string | null {
  if (status === 'AVAILABLE') return null;
  if (status === 'IN_MAINTENANCE') return 'Техника на обслуживании и сейчас недоступна';
  return 'Техника сейчас недоступна';
}
