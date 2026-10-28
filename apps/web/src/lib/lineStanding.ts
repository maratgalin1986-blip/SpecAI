// «На линии на 5 рабочих дней» (owner, 2026-10-28): «чтобы исполнители не раз в
// сутки вставали на линию». Going on the line is a standing availability with
// an end date, not a ping that dies with the phone's screen: customers see the
// machine until the end of the 5th working day (or a chosen date, or until the
// provider switches it off). Live GPS stays optional — with a fresh position
// the bubble says «рядом сейчас», without it the machine stands at its base
// with «на линии до пт». Pure helpers; the rows are LinePresence.
//
// Working days are Monday to Friday in the provider's own time zone. There is
// no public-holiday calendar in the code yet, so holidays count as working
// days (the provider can renew or switch off; noted in docs/owner-requests.md).

import { LINE_DEFAULT_TIME_ZONE, validTimeZone } from './lineDay';

/** The default period: «На линии на 5 рабочих дней». */
export const STANDING_WORKDAYS = 5;
/** «до …»: a chosen date at most this many days ahead. */
export const STANDING_MAX_DAYS = 60;
/** The renewal offer goes out when the period ends within this time (the daily cron runs once a day). */
export const RENEW_OFFER_AHEAD_MS = 36 * 60 * 60_000;

export type StandingMode = 'days5' | 'until' | 'forever' | 'off';

const DAY_MS = 24 * 60 * 60_000;

/** «2026-10-28» → [2026, 10, 28]. */
function ymd(dayKey: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = dayKey.split('-').map(Number);
  return [y, m, d];
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    if (formatters.size < 64) formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zoneOf(timeZone: string | null | undefined): string {
  return validTimeZone(timeZone) ?? LINE_DEFAULT_TIME_ZONE;
}

/** The zone's offset from UTC at a moment, in milliseconds (Moscow: +3 h). */
function offsetMs(date: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The local calendar day of a moment: «2026-10-28». */
export function localDayKey(date: Date, timeZone: string | null | undefined): string {
  const parts = partsFormatter(zoneOf(timeZone)).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Day key → its weekday, 0 = Sunday … 6 = Saturday (the calendar's, not a zone's). */
export function weekdayOf(dayKey: string): number {
  const [y, m, d] = ymd(dayKey);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWorkingDay(dayKey: string): boolean {
  const weekday = weekdayOf(dayKey);
  return weekday >= 1 && weekday <= 5;
}

/** The day key `n` calendar days after `dayKey`. */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = ymd(dayKey);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The first moment of a local day (00:00 in the zone), as a Date. */
export function localDayStart(dayKey: string, timeZone: string | null | undefined): Date {
  const zone = zoneOf(timeZone);
  const [y, m, d] = ymd(dayKey);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes settle a zone whose offset changed that day.
  let start = guess - offsetMs(new Date(guess), zone);
  start = guess - offsetMs(new Date(start), zone);
  return new Date(start);
}

/** The last moment of a local day (23:59:59.999), as a Date. */
export function localDayEnd(dayKey: string, timeZone: string | null | undefined): Date {
  return new Date(localDayStart(addDays(dayKey, 1), timeZone).getTime() - 1);
}

/**
 * The end of a period of `days` working days that starts at `now`: today
 * counts when it is a working day (Wednesday → Tuesday), a weekend start
 * begins on Monday (Saturday → Friday). The end is 23:59:59.999 of the last
 * working day in the provider's zone.
 */
export function workingDaysEnd(
  now: Date,
  timeZone: string | null | undefined,
  days: number = STANDING_WORKDAYS,
): Date {
  let day = localDayKey(now, timeZone);
  let left = Math.max(1, Math.floor(days));
  for (let guard = 0; guard < 400; guard += 1) {
    if (isWorkingDay(day)) {
      left -= 1;
      if (left === 0) break;
    }
    day = addDays(day, 1);
  }
  return localDayEnd(day, timeZone);
}

/** «до …»: «2026-11-06» → the end of that local day; null for a past, junk or too far date. */
export function untilDateEnd(
  raw: string,
  now: Date,
  timeZone: string | null | undefined,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = ymd(raw);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  const end = localDayEnd(raw, timeZone);
  if (end.getTime() <= now.getTime()) return null;
  if (end.getTime() - now.getTime() > (STANDING_MAX_DAYS + 1) * DAY_MS) return null;
  return end;
}

export interface StandingFields {
  standingUntil?: Date | null;
  standingForever?: boolean | null;
}

/** On the line by the standing availability (whatever the phone does). */
export function standingActive(row: StandingFields, now: Date = new Date()): boolean {
  if (row.standingForever) return true;
  return Boolean(row.standingUntil && row.standingUntil.getTime() > now.getTime());
}

/** The columns a mode writes; null for a «до …» date that cannot be used. */
export function standingData(
  mode: StandingMode,
  now: Date,
  timeZone: string | null | undefined,
  until?: string,
): {
  standingUntil: Date | null;
  standingForever: boolean;
  standingSince: Date | null;
  renewOfferAt: null;
} | null {
  switch (mode) {
    case 'off':
      return {
        standingUntil: null,
        standingForever: false,
        standingSince: null,
        renewOfferAt: null,
      };
    case 'forever':
      return { standingUntil: null, standingForever: true, standingSince: now, renewOfferAt: null };
    case 'days5':
      return {
        standingUntil: workingDaysEnd(now, timeZone),
        standingForever: false,
        standingSince: now,
        renewOfferAt: null,
      };
    case 'until': {
      const end = until ? untilDateEnd(until, now, timeZone) : null;
      return end
        ? { standingUntil: end, standingForever: false, standingSince: now, renewOfferAt: null }
        : null;
    }
  }
}

/**
 * «Продлить на 5 рабочих дней» from a period that is still running: the
 * new 5 working days start the day after the current end, so a renewal on
 * Thursday of a period ending Friday runs until the next Friday.
 */
export function renewedUntil(
  row: StandingFields,
  now: Date,
  timeZone: string | null | undefined,
): Date {
  const from =
    row.standingUntil && row.standingUntil.getTime() > now.getTime()
      ? new Date(row.standingUntil.getTime() + 1)
      : now;
  return workingDaysEnd(from, timeZone);
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/**
 * «до пт» within the coming week, «до 06.11» further; «до отключения» for
 * «пока не отключу»; null when the standing line is not on.
 */
export function untilText(
  row: StandingFields,
  now: Date,
  timeZone: string | null | undefined,
): string | null {
  if (row.standingForever) return 'до отключения';
  if (!standingActive(row, now) || !row.standingUntil) return null;
  const endDay = localDayKey(row.standingUntil, timeZone);
  const today = localDayKey(now, timeZone);
  if (endDay === today) return 'до конца дня';
  const [, m, d] = endDay.split('-');
  const inWeek = endDay <= addDays(today, 6);
  return inWeek ? `до ${WEEKDAY_SHORT[weekdayOf(endDay)]}` : `до ${d}.${m}`;
}

/** «на линии до пт» — the bubble's tail for a machine without fresh GPS. */
export function standingBubbleTail(
  row: StandingFields,
  now: Date,
  timeZone: string | null | undefined,
): string {
  const until = untilText(row, now, timeZone);
  return until ? `на линии ${until}` : 'на линии';
}

/** The date for the provider's toggle and the renewal offer: «30.10 (пт)». */
export function untilLong(until: Date, timeZone: string | null | undefined): string {
  const day = localDayKey(until, timeZone);
  const [, m, d] = day.split('-');
  return `${d}.${m} (${WEEKDAY_SHORT[weekdayOf(day)]})`;
}

/**
 * The renewal offer is due: the period ends within RENEW_OFFER_AHEAD_MS, and
 * no offer went out for this period yet (renewOfferAt before its start).
 */
export function renewOfferDue(
  row: StandingFields & { standingSince?: Date | null; renewOfferAt?: Date | null },
  now: Date,
): boolean {
  if (row.standingForever || !row.standingUntil) return false;
  const left = row.standingUntil.getTime() - now.getTime();
  if (left <= 0 || left > RENEW_OFFER_AHEAD_MS) return false;
  if (!row.renewOfferAt) return true;
  return Boolean(row.standingSince && row.renewOfferAt.getTime() < row.standingSince.getTime());
}

// ---------------------------------------------------------------------------
// Busy dates: a CONFIRMED or ACTIVE booking of the machine covers a day → the
// machine is busy on that day, whatever its line says.
// ---------------------------------------------------------------------------

export interface BusyBooking {
  equipmentId: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export const BUSY_STATUSES = ['CONFIRMED', 'ACTIVE'] as const;

/** The Moscow day keys (dates are by Moscow, REVIEW.md §5) a booking covers, from `fromDay` on, at most `limit`. */
export function busyDays(
  bookings: readonly BusyBooking[],
  equipmentId: string,
  fromDay: string,
  limit = 14,
): string[] {
  const days = new Set<string>();
  const last = addDays(fromDay, limit - 1);
  for (const booking of bookings) {
    if (booking.equipmentId !== equipmentId) continue;
    if (!(BUSY_STATUSES as readonly string[]).includes(booking.status)) continue;
    let day = localDayKey(booking.startDate, 'Europe/Moscow');
    const end = localDayKey(booking.endDate, 'Europe/Moscow');
    if (day < fromDay) day = fromDay;
    for (let guard = 0; day <= end && day <= last && guard < limit; guard += 1) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return [...days].sort();
}
