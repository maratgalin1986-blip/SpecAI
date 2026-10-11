// Shift statuses of the operator («машинист»): which transitions are allowed,
// what each one writes on the shift and how long the machine worked or stood
// idle. Pure functions over loaded rows, unit-tested in shiftRules.test.ts;
// the API routes under /api/shifts do the loading and the writes.
import {
  SHIFT_STATUS_LABELS,
  SHIFT_TRANSITIONS,
  shiftStatusSchema,
  type ShiftStatus,
} from '@specai/shared';
import { moscowDateKey } from './bookingRules';

export interface ShiftLike {
  status: string;
  startedAt?: Date | null;
  arrivedAt?: Date | null;
  workStartedAt?: Date | null;
  finishedAt?: Date | null;
  startPhotoUrl?: string | null;
  endPhotoUrl?: string | null;
}

export interface ShiftEventLike {
  kind: string;
  at: Date;
}

export function asShiftStatus(value: string): ShiftStatus | null {
  const parsed = shiftStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The statuses the operator may pick next («Выехал» → «На объекте» …). */
export function nextShiftStatuses(status: string): ShiftStatus[] {
  const current = asShiftStatus(status);
  return current ? [...SHIFT_TRANSITIONS[current]] : [];
}

export function shiftStatusLabel(status: string): string {
  const parsed = asShiftStatus(status);
  return parsed ? SHIFT_STATUS_LABELS[parsed] : status;
}

export type ShiftTransitionResult =
  | {
      ok: true;
      data: {
        status: ShiftStatus;
        startedAt?: Date;
        arrivedAt?: Date;
        workStartedAt?: Date;
        finishedAt?: Date;
        startPhotoUrl?: string;
        endPhotoUrl?: string;
      };
    }
  | { ok: false; error: string };

/**
 * What a transition writes on the shift: the first time a status is reached
 * its timestamp is set (the second «Работа» after «Простой» keeps the first
 * workStartedAt). A photo sent with the first move becomes the start photo,
 * one sent with «Смена завершена» the end photo. «Простой» needs a reason.
 */
export function applyShiftTransition(
  shift: ShiftLike,
  input: { status: ShiftStatus; note?: string; photoUrl?: string },
  now: Date = new Date(),
): ShiftTransitionResult {
  const allowed = nextShiftStatuses(shift.status);
  if (!allowed.includes(input.status)) {
    return {
      ok: false,
      error: `Нельзя перейти из «${shiftStatusLabel(shift.status)}» в «${shiftStatusLabel(input.status)}»`,
    };
  }
  if (input.status === 'IDLE' && !input.note?.trim()) {
    return { ok: false, error: 'Укажите причину простоя' };
  }
  const data: Extract<ShiftTransitionResult, { ok: true }>['data'] = { status: input.status };
  if (!shift.startedAt) data.startedAt = now;
  if (input.status === 'ON_SITE' && !shift.arrivedAt) data.arrivedAt = now;
  if (input.status === 'WORKING' && !shift.workStartedAt) data.workStartedAt = now;
  if (input.status === 'FINISHED') data.finishedAt = now;
  if (input.photoUrl) {
    if (input.status === 'FINISHED') data.endPhotoUrl = input.photoUrl;
    else if (!shift.startPhotoUrl) data.startPhotoUrl = input.photoUrl;
  }
  return { ok: true, data };
}

/**
 * Minutes of work and of idle time from the event log: a WORKING event opens
 * a work interval, IDLE opens an idle one, FINISHED closes both. An open
 * interval runs until `now`.
 */
export function shiftDurations(
  events: ShiftEventLike[],
  now: Date = new Date(),
): { workedMinutes: number; idleMinutes: number } {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let worked = 0;
  let idle = 0;
  let current: 'WORKING' | 'IDLE' | null = null;
  let since = 0;
  const close = (at: number) => {
    if (current === 'WORKING') worked += at - since;
    if (current === 'IDLE') idle += at - since;
    current = null;
  };
  for (const event of sorted) {
    const at = event.at.getTime();
    if (event.kind === 'WORKING' || event.kind === 'IDLE') {
      close(at);
      current = event.kind;
      since = at;
    } else if (event.kind === 'FINISHED') {
      close(at);
    }
  }
  close(now.getTime());
  return {
    workedMinutes: Math.max(0, Math.round(worked / 60_000)),
    idleMinutes: Math.max(0, Math.round(idle / 60_000)),
  };
}

/** «7 ч 30 мин» for the shift card. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Hours with a quarter-hour step from minutes: 7 ч 40 мин → 7.75. */
export function suggestedHours(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4;
}

/**
 * The calendar day of a shift as UTC midnight of the Moscow day: "2026-10-08"
 * or any instant of that Moscow day → 2026-10-08T00:00:00Z. Null for a bad
 * string.
 */
export function shiftDay(input: string | Date | undefined, now: Date = new Date()): Date | null {
  if (input === undefined) return new Date(`${moscowDateKey(now)}T00:00:00.000Z`);
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(`${moscowDateKey(input)}T00:00:00.000Z`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A shift may be opened only inside the booking's dates (both inclusive). */
export function shiftDayWithinBooking(
  day: Date,
  booking: { startDate: Date; endDate: Date },
): boolean {
  const key = moscowDateKey(day);
  return key >= moscowDateKey(booking.startDate) && key <= moscowDateKey(booking.endDate);
}

export interface TimesheetLike {
  customerConfirmedAt?: Date | null;
  providerConfirmedAt?: Date | null;
  disputedAt?: Date | null;
}

/** Final only when both the customer and the provider's admin confirmed it. */
export function isTimesheetFinal(timesheet: TimesheetLike | null | undefined): boolean {
  return Boolean(timesheet?.customerConfirmedAt && timesheet?.providerConfirmedAt);
}

export type TimesheetState = 'none' | 'waiting' | 'disputed' | 'final';

export function timesheetState(timesheet: TimesheetLike | null | undefined): TimesheetState {
  if (!timesheet) return 'none';
  if (isTimesheetFinal(timesheet)) return 'final';
  if (timesheet.disputedAt) return 'disputed';
  return 'waiting';
}

export const TIMESHEET_STATE_LABELS: Record<TimesheetState, string> = {
  none: 'Табель не заполнен',
  waiting: 'Ждёт подтверждения',
  disputed: 'Есть замечания',
  final: 'Подтверждён обеими сторонами',
};
