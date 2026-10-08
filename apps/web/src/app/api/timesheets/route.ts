import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { timesheetSubmitSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { NO_ACCESS, loadBookingAccess, shiftInclude, shiftToJson } from '@/lib/shiftAccess';

export const dynamic = 'force-dynamic';

/**
 * The operator or the provider submits the shift's timesheet («табель»):
 * hours worked, idle hours, a note. Allowed once the shift is finished; a
 * repeat (after the customer's remarks) replaces the figures and starts the
 * confirmations over. Submitting as the provider's admin counts as the
 * provider's confirmation. The customer is told and asked to confirm.
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
  const parsed = timesheetSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const shift = await prisma.shift.findUnique({
    where: { id: parsed.data.shiftId },
    include: shiftInclude,
  });
  const access = shift ? await loadBookingAccess(currentUser, shift.bookingId) : null;
  if (!shift || !access) return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
  if (access.role === 'customer') {
    return NextResponse.json({ error: 'Табель заполняет исполнитель' }, { status: 403 });
  }
  if (shift.status !== 'FINISHED') {
    return NextResponse.json(
      { error: 'Сначала завершите смену, потом заполните табель' },
      { status: 409 },
    );
  }
  if (
    shift.timesheet &&
    shift.timesheet.customerConfirmedAt &&
    shift.timesheet.providerConfirmedAt
  ) {
    return NextResponse.json({ error: 'Табель уже подтверждён обеими сторонами' }, { status: 409 });
  }

  const now = new Date();
  const note = parsed.data.note?.trim() || null;
  const data = {
    hoursWorked: parsed.data.hoursWorked,
    idleHours: parsed.data.idleHours,
    note,
    customerConfirmedAt: null,
    providerConfirmedAt: access.role === 'provider' ? now : null,
    disputedAt: null,
    disputeNote: null,
  };
  const timesheet = await prisma.timesheet.upsert({
    where: { shiftId: shift.id },
    create: { shiftId: shift.id, ...data },
    update: data,
  });

  void notifyUser(access.booking.customerId, {
    type: 'timesheet',
    bookingId: access.booking.id,
    equipmentName: access.booking.equipment.name,
    step: 'submitted',
    hoursWorked: timesheet.hoursWorked.toString(),
    audience: 'customer',
    note,
  }).catch((error) => console.error('[notify] timesheet submitted failed', error));

  const updated = await prisma.shift.findUniqueOrThrow({
    where: { id: shift.id },
    include: shiftInclude,
  });
  return NextResponse.json({ shift: shiftToJson(updated, now) }, { status: 201 });
}
