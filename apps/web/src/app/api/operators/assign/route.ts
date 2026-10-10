import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { assignOperatorSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';

export const dynamic = 'force-dynamic';

/**
 * Assigns one of the company's active operators to a booking of its
 * machinery (or takes the operator off with `operatorId: null`). Shifts not
 * yet finished follow the new operator.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json(
      { error: 'Машиниста назначает администратор компании-исполнителя' },
      { status: 403 },
    );
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = assignOperatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, equipment: { companyId: currentUser.companyId } },
    select: { id: true, status: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return NextResponse.json(
      { error: 'На завершённую или отменённую бронь машиниста не назначить' },
      { status: 409 },
    );
  }
  let operator: { id: string; name: string } | null = null;
  if (parsed.data.operatorId) {
    operator = await prisma.operator.findFirst({
      where: { id: parsed.data.operatorId, companyId: currentUser.companyId, active: true },
      select: { id: true, name: true },
    });
    if (!operator) {
      return NextResponse.json({ error: 'Машинист не найден или отключён' }, { status: 404 });
    }
  }
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { operatorId: operator?.id ?? null },
    }),
    prisma.shift.updateMany({
      where: { bookingId: booking.id, status: { not: 'FINISHED' } },
      data: { operatorId: operator?.id ?? null },
    }),
  ]);
  return NextResponse.json({ bookingId: booking.id, operator });
}
