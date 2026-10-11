// Who may see and drive a booking's shifts: the customer (watches, confirms
// the timesheet), the provider's admin (everything of its company), the
// operator assigned to the booking (shift controls, timesheet). Loads the
// rows for the /api/shifts and /api/timesheets routes and shapes the JSON.
import { prisma, type Prisma } from '@specai/database';
import { isOperator, isProvider } from './fleet';
import type { RequestUser } from './requestUser';
import {
  formatMinutes,
  nextShiftStatuses,
  shiftDurations,
  shiftStatusLabel,
  timesheetState,
} from './shiftRules';

export type ShiftRole = 'customer' | 'provider' | 'operator';

/** The Operator row behind a PROVIDER_OPERATOR account, if any. */
export async function operatorOf(user: RequestUser | null) {
  if (!isOperator(user)) return null;
  return prisma.operator.findUnique({
    where: { userId: user.id },
    select: { id: true, companyId: true, active: true, name: true },
  });
}

export const bookingForShiftsInclude = {
  equipment: { select: { id: true, name: true, companyId: true, imageUrls: true } },
  customer: { select: { id: true, phone: true } },
  deliveryLocation: { select: { addressLine: true, city: true } },
} satisfies Prisma.BookingInclude;

export type BookingForShifts = Prisma.BookingGetPayload<{
  include: typeof bookingForShiftsInclude;
}>;

/**
 * The booking and the caller's role on it, or null when the caller has no
 * business with it (a 404 to the client, so bookings are not enumerable).
 */
export async function loadBookingAccess(
  user: RequestUser | null,
  bookingId: string,
): Promise<{ booking: BookingForShifts; role: ShiftRole; operatorId: string | null } | null> {
  if (!user) return null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingForShiftsInclude,
  });
  if (!booking) return null;
  if (booking.customerId === user.id) return { booking, role: 'customer', operatorId: null };
  if (isProvider(user) && user.companyId === booking.equipment.companyId) {
    return { booking, role: 'provider', operatorId: booking.operatorId };
  }
  const operator = await operatorOf(user);
  if (operator && operator.active && booking.operatorId === operator.id) {
    return { booking, role: 'operator', operatorId: operator.id };
  }
  return null;
}

export const shiftInclude = {
  events: { orderBy: { at: 'asc' } },
  timesheet: true,
  operator: { select: { id: true, name: true } },
} satisfies Prisma.ShiftInclude;

export type ShiftRow = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;

export interface ShiftJson {
  id: string;
  bookingId: string;
  date: string;
  status: string;
  statusLabel: string;
  startedAt: string | null;
  arrivedAt: string | null;
  workStartedAt: string | null;
  finishedAt: string | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  operator: { id: string; name: string } | null;
  events: {
    id: string;
    kind: string;
    label: string;
    at: string;
    note: string | null;
    photoUrl: string | null;
  }[];
  workedMinutes: number;
  idleMinutes: number;
  workedLabel: string;
  idleLabel: string;
  /** Statuses the operator may pick next. */
  next: string[];
  timesheet: TimesheetJson | null;
}

export interface TimesheetJson {
  id: string;
  shiftId: string;
  hoursWorked: string;
  idleHours: string;
  note: string | null;
  customerConfirmedAt: string | null;
  providerConfirmedAt: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  state: 'none' | 'waiting' | 'disputed' | 'final';
  updatedAt: string;
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export function timesheetToJson(row: ShiftRow['timesheet']): TimesheetJson | null {
  if (!row) return null;
  return {
    id: row.id,
    shiftId: row.shiftId,
    hoursWorked: row.hoursWorked.toString(),
    idleHours: row.idleHours.toString(),
    note: row.note,
    customerConfirmedAt: iso(row.customerConfirmedAt),
    providerConfirmedAt: iso(row.providerConfirmedAt),
    disputedAt: iso(row.disputedAt),
    disputeNote: row.disputeNote,
    state: timesheetState(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The shift as the app and the site show it, with the running timer. */
export function shiftToJson(shift: ShiftRow, now: Date = new Date()): ShiftJson {
  const { workedMinutes, idleMinutes } = shiftDurations(shift.events, now);
  return {
    id: shift.id,
    bookingId: shift.bookingId,
    date: shift.date.toISOString().slice(0, 10),
    status: shift.status,
    statusLabel: shiftStatusLabel(shift.status),
    startedAt: iso(shift.startedAt),
    arrivedAt: iso(shift.arrivedAt),
    workStartedAt: iso(shift.workStartedAt),
    finishedAt: iso(shift.finishedAt),
    startPhotoUrl: shift.startPhotoUrl,
    endPhotoUrl: shift.endPhotoUrl,
    operator: shift.operator,
    events: shift.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      label: shiftStatusLabel(event.kind),
      at: event.at.toISOString(),
      note: event.note,
      photoUrl: event.photoUrl,
    })),
    workedMinutes,
    idleMinutes,
    workedLabel: formatMinutes(workedMinutes),
    idleLabel: formatMinutes(idleMinutes),
    next: nextShiftStatuses(shift.status),
    timesheet: timesheetToJson(shift.timesheet),
  };
}

export const NO_ACCESS = 'Бронирование не найдено';
