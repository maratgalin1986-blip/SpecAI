import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { shiftTransitionSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { NO_ACCESS, loadBookingAccess, shiftInclude, shiftToJson } from '@/lib/shiftAccess';
import { applyShiftTransition, shiftStatusLabel } from '@/lib/shiftRules';

export const dynamic = 'force-dynamic';

async function loadShift(id: string) {
  return prisma.shift.findUnique({ where: { id }, include: shiftInclude });
}

/** One shift with its event log, timer and timesheet (the customer polls this). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  const shift = await loadShift(params.id);
  const access = shift ? await loadBookingAccess(currentUser, shift.bookingId) : null;
  if (!shift || !access) return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
  return NextResponse.json({ role: access.role, shift: shiftToJson(shift) });
}

/**
 * Moves the shift: Выехал → На объекте → Работа ⇄ Простой → Смена завершена.
 * The assigned operator or the provider's admin; a photo with the first move
 * is the start photo, with «Смена завершена» the end photo; «Простой» needs
 * a reason. Every move is logged as a ShiftEvent and the customer is told.
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
  const parsed = shiftTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const shift = await loadShift(params.id);
  const access = shift ? await loadBookingAccess(currentUser, shift.bookingId) : null;
  if (!shift || !access) return NextResponse.json({ error: NO_ACCESS }, { status: 404 });
  if (access.role === 'customer') {
    return NextResponse.json({ error: 'Статус смены меняет машинист' }, { status: 403 });
  }

  const now = new Date();
  const note = parsed.data.note?.trim() || undefined;
  const transition = applyShiftTransition(
    shift,
    { status: parsed.data.status, note, photoUrl: parsed.data.photoUrl },
    now,
  );
  if (!transition.ok) {
    return NextResponse.json({ error: transition.error }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Only from the status we checked: a double tap must not log the move twice.
    const { count } = await tx.shift.updateMany({
      where: { id: shift.id, status: shift.status },
      data: {
        ...transition.data,
        // The operator who drives the shift from the app is recorded on it.
        ...(access.role === 'operator' && !shift.operatorId
          ? { operatorId: access.operatorId }
          : {}),
      },
    });
    if (count === 0) return null;
    await tx.shiftEvent.create({
      data: {
        shiftId: shift.id,
        kind: transition.data.status,
        at: now,
        note: note ?? null,
        photoUrl: parsed.data.photoUrl ?? null,
      },
    });
    return tx.shift.findUniqueOrThrow({ where: { id: shift.id }, include: shiftInclude });
  });
  if (!updated) {
    return NextResponse.json(
      { error: 'Статус смены уже изменён — обновите экран' },
      { status: 409 },
    );
  }

  // Fire-and-forget: the customer hears of every move over their channels.
  void notifyUser(access.booking.customerId, {
    type: 'shift.status',
    bookingId: access.booking.id,
    equipmentName: access.booking.equipment.name,
    statusLabel: shiftStatusLabel(updated.status),
    note,
    at: now,
  }).catch((error) => console.error('[notify] shift status failed', error));

  return NextResponse.json({ shift: shiftToJson(updated, now) });
}
