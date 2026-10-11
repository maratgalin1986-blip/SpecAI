// Occupancy calendar of a machine: booked, pending, blocked («Не сдаётся»),
// maintenance and free days of a month, and the next free date for the public
// page. Pure functions over loaded rows, unit-tested in occupancy.test.ts.
import { moscowDateKey } from './bookingRules';

export type DayKind = 'free' | 'booked' | 'pending' | 'blocked' | 'maintenance';

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  free: 'Свободна',
  booked: 'Занята',
  pending: 'Ждёт подтверждения',
  blocked: 'Не сдаётся',
  maintenance: 'На ремонте',
};

export interface CalendarBooking {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export interface CalendarBlock {
  id: string;
  from: Date;
  to: Date;
  reason?: string | null;
}

export interface CalendarDay {
  /** YYYY-MM-DD (Moscow calendar day). */
  date: string;
  kind: DayKind;
  bookingId?: string;
  blockId?: string;
  past: boolean;
}

export interface CalendarInput {
  year: number;
  /** 1–12 */
  month: number;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  /** Equipment status IN_MAINTENANCE: every day not taken by a booking. */
  inMaintenance?: boolean;
  today?: Date;
}

/** Statuses that hold the day for sure. */
const BOOKED = new Set(['CONFIRMED', 'ACTIVE', 'COMPLETED']);

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function within(key: string, start: Date, end: Date): boolean {
  return key >= moscowDateKey(start) && key <= moscowDateKey(end);
}

/** What one calendar day is: the strongest claim wins (booked > blocked > pending > maintenance). */
export function classifyDay(
  key: string,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  inMaintenance = false,
): Omit<CalendarDay, 'date' | 'past'> {
  let pending: CalendarBooking | undefined;
  for (const booking of bookings) {
    if (booking.status === 'CANCELLED') continue;
    if (!within(key, booking.startDate, booking.endDate)) continue;
    if (BOOKED.has(booking.status)) return { kind: 'booked', bookingId: booking.id };
    pending ??= booking;
  }
  const block = blocks.find((row) => within(key, row.from, row.to));
  if (block) return { kind: 'blocked', blockId: block.id };
  if (pending) return { kind: 'pending', bookingId: pending.id };
  if (inMaintenance) return { kind: 'maintenance' };
  return { kind: 'free' };
}

/** Every day of the month with its kind; `past` marks days before today (Moscow). */
export function monthCalendar(input: CalendarInput): CalendarDay[] {
  const todayKey = moscowDateKey(input.today ?? new Date());
  const days: CalendarDay[] = [];
  const total = daysInMonth(input.year, input.month);
  for (let day = 1; day <= total; day += 1) {
    const date = dayKey(input.year, input.month, day);
    days.push({
      date,
      past: date < todayKey,
      ...classifyDay(date, input.bookings, input.blocks, input.inMaintenance),
    });
  }
  return days;
}

/** Counts for the legend («занята 12 дней, свободна 10»). */
export function calendarSummary(days: CalendarDay[]): Record<DayKind, number> {
  const summary: Record<DayKind, number> = {
    free: 0,
    booked: 0,
    pending: 0,
    blocked: 0,
    maintenance: 0,
  };
  for (const day of days) summary[day.kind] += 1;
  return summary;
}

/**
 * The first day from `from` (today by default) when the machine is free of
 * bookings, pending requests and blocks, within `horizonDays`. Null when a
 * machine is in maintenance or nothing is free in the horizon.
 */
export function nextFreeDate(
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  options: { from?: Date; inMaintenance?: boolean; horizonDays?: number } = {},
): string | null {
  if (options.inMaintenance) return null;
  const horizon = options.horizonDays ?? 90;
  const start = options.from ?? new Date();
  for (let offset = 0; offset < horizon; offset += 1) {
    const key = moscowDateKey(new Date(start.getTime() + offset * 86_400_000));
    if (classifyDay(key, bookings, blocks).kind === 'free') return key;
  }
  return null;
}

/** «сегодня», «завтра» or «с 12.10» for the «Свободна с …» chip. */
export function freeFromLabel(key: string | null, today: Date = new Date()): string {
  if (!key) return 'Даты уточняйте';
  const todayKey = moscowDateKey(today);
  if (key <= todayKey) return 'Свободна сегодня';
  const tomorrow = moscowDateKey(new Date(today.getTime() + 86_400_000));
  if (key === tomorrow) return 'Свободна с завтра';
  const [, month, day] = key.split('-');
  return `Свободна с ${day}.${month}`;
}

/** Month navigation: "2026-10" → { year, month }, or null. */
export function parseMonth(value: string | null | undefined, now: Date = new Date()) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number) as [number, number];
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month };
  }
  const [year, month] = moscowDateKey(now).split('-').map(Number) as [number, number, number];
  return { year, month };
}
