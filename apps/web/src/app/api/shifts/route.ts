import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createShiftSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { maskContacts } from '@/lib/privacy';
import { bookingForOperator } from '@/lib/operatorView';
import {
  NO_ACCESS,
  bookingForShiftsInclude,
  loadBookingAccess,
  operatorOf,
  shiftInclude,
  shiftToJson,
} from '@/lib/shiftAccess';
import { shiftDay, shiftDayWithinBooking } from '@/lib/shiftRules';

export const dynamic = 'force-dynamic';

/**
 * Shifts of a booking (`?bookingId=`) for its customer, provider or operator,
 * or — for an operator («машинист», `?mine=1`) — the bookings assigned to
 * them with their shifts: no prices, no customer name, the site phone only
 * while the booking is confirmed or active (lib/operatorView.ts).
 */
export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (bookingId) {
    const access = await loadBookingAccess(currentUser, bookingId);
    if (!access) return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
    const shifts = await prisma.shift.findMany({
      where: { bookingId },
      include: shiftInclude,
      orderBy: { date: 'desc' },
      take: 100,
    });
    return NextResponse.json({
      role: access.role,
      shifts: shifts.map((shift) => shiftToJson(shift)),
    });
  }

  const operator = await operatorOf(currentUser);
  if (!operator) {
    return NextResponse.json({ error: 'Требуется аккаунт машиниста' }, { status: 403 });
  }
  if (!operator.active) {
    return NextResponse.json({ bookings: [], operator: { name: operator.name, active: false } });
  }
  const bookings = await prisma.booking.findMany({
    where: { operatorId: operator.id, status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] } },
    include: {
      ...bookingForShiftsInclude,
      shifts: { include: shiftInclude, orderBy: { date: 'desc' }, take: 31 },
    },
    orderBy: { startDate: 'desc' },
    take: 100,
  });
  const now = new Date();
  return NextResponse.json({
    operator: { name: operator.name, active: true },
    bookings: bookings.map((booking) => ({
      ...bookingForOperator(booking, maskContacts),
      shifts: booking.shifts.map((shift) => shiftToJson(shift, now)),
    })),
  });
}

/**
 * Opens the shift of a day (today in Moscow by default) for a confirmed or
 * active booking: the assigned operator or the provider's admin. One shift per
 * booking per day — a repeat returns the existing one.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const access = await loadBookingAccess(currentUser, parsed.data.bookingId);
  if (!access || access.role === 'customer') {
    return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
  }
  if (access.booking.status !== 'CONFIRMED' && access.booking.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Смену можно открыть только по подтверждённой брони' },
      { status: 409 },
    );
  }
  const date = shiftDay(parsed.data.date);
  if (!date) {
    return NextResponse.json({ error: 'Дата в формате ГГГГ-ММ-ДД' }, { status: 400 });
  }
  if (!shiftDayWithinBooking(date, access.booking)) {
    return NextResponse.json({ error: 'Этот день не входит в даты брони' }, { status: 409 });
  }
  const existing = await prisma.shift.findUnique({
    where: { bookingId_date: { bookingId: access.booking.id, date } },
    include: shiftInclude,
  });
  if (existing) return NextResponse.json({ shift: shiftToJson(existing) });
  const shift = await prisma.shift.create({
    data: { bookingId: access.booking.id, date, operatorId: access.operatorId },
    include: shiftInclude,
  });
  return NextResponse.json({ shift: shiftToJson(shift) }, { status: 201 });
}
