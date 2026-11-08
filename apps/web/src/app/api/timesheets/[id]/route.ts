import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { timesheetReviewSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { notifyCompany, notifyUser } from '@/lib/notifications/notifyUser';
import { NO_ACCESS, loadBookingAccess, shiftInclude, shiftToJson } from '@/lib/shiftAccess';
import { isTimesheetFinal } from '@/lib/shiftRules';

export const dynamic = 'force-dynamic';

/**
 * The customer confirms or disputes the timesheet; the provider's admin
 * confirms it (or disputes the operator's figures). Final only when both
 * confirmations are set. The other side is told of every step.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = timesheetReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: params.id },
    include: { shift: { select: { id: true, bookingId: true } } },
  });
  const access = timesheet ? await loadBookingAccess(currentUser, timesheet.shift.bookingId) : null;
  if (!timesheet || !access) return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
  if (access.role === 'operator') {
    return NextResponse.json(
      { error: 'Табель подтверждают заказчик и администратор компании' },
      { status: 403 },
    );
  }
  if (isTimesheetFinal(timesheet)) {
    return NextResponse.json({ error: 'Табель уже подтверждён обеими сторонами' }, { status: 409 });
  }

  const now = new Date();
  const note = parsed.data.note?.trim() || null;
  if (parsed.data.action === 'dispute' && !note) {
    return NextResponse.json({ error: 'Напишите, что не так с табелем' }, { status: 400 });
  }
  const data =
    parsed.data.action === 'confirm'
      ? access.role === 'customer'
        ? { customerConfirmedAt: now, disputedAt: null, disputeNote: null }
        : { providerConfirmedAt: now }
      : access.role === 'customer'
        ? { customerConfirmedAt: null, disputedAt: now, disputeNote: note }
        : { providerConfirmedAt: null, disputedAt: now, disputeNote: note };
  const updated = await prisma.timesheet.update({ where: { id: timesheet.id }, data });

  const final = isTimesheetFinal(updated);
  const event = {
    type: 'timesheet' as const,
    bookingId: access.booking.id,
    equipmentName: access.booking.equipment.name,
    step: final
      ? ('final' as const)
      : parsed.data.action === 'confirm'
        ? ('confirmed' as const)
        : ('disputed' as const),
    hoursWorked: updated.hoursWorked.toString(),
    note,
  };
  // The other side hears of the step; when it became final, both do.
  const tellProvider = access.role === 'customer' || final;
  const tellCustomer = access.role === 'provider' || final;
  if (tellProvider) {
    void notifyCompany(access.booking.equipment.companyId, {
      ...event,
      audience: 'provider',
    }).catch((error) => console.error('[notify] timesheet review (provider) failed', error));
  }
  if (tellCustomer) {
    void notifyUser(access.booking.customerId, { ...event, audience: 'customer' }).catch((error) =>
      console.error('[notify] timesheet review (customer) failed', error),
    );
  }

  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: timesheet.shift.id },
    include: shiftInclude,
  });
  return NextResponse.json({ shift: shiftToJson(shift, now) });
}
