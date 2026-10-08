import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createEquipmentBlockSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { BOOKING_TIME_ZONE, CONFIRMED_BOOKING_STATUSES, toBookingDay } from '@/lib/bookingRules';
import { findOverlappingBooking, lockEquipment } from '@/lib/bookingConflicts';

export const dynamic = 'force-dynamic';

function blockToJson(block: { id: string; from: Date; to: Date; reason: string | null }) {
  return {
    id: block.id,
    from: block.from.toISOString().slice(0, 10),
    to: block.to.toISOString().slice(0, 10),
    reason: block.reason,
  };
}

async function ownMachine(request: NextRequest, id: string) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) return null;
  return prisma.equipment.findFirst({
    where: { id, companyId: currentUser.companyId },
    select: { id: true, name: true },
  });
}

/** Manual blocks («Не сдаётся») of the provider's own machine, upcoming first. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const machine = await ownMachine(request, params.id);
  if (!machine) return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  const blocks = await prisma.equipmentBlock.findMany({
    where: { equipmentId: machine.id },
    orderBy: { from: 'asc' },
    take: 200,
  });
  return NextResponse.json({ blocks: blocks.map(blockToJson) });
}

/**
 * Takes the machine off the calendar for a range of days (both inclusive).
 * Refused when a confirmed or active booking already holds one of the days;
 * pending requests are left to the provider to decline.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const machine = await ownMachine(request, params.id);
  if (!machine) return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createEquipmentBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const from = toBookingDay(parsed.data.from);
  const to = toBookingDay(parsed.data.to);
  const result = await prisma.$transaction(async (tx) => {
    await lockEquipment(tx, machine.id);
    const booked = await findOverlappingBooking(tx, {
      equipmentId: machine.id,
      startDate: from,
      endDate: to,
      statuses: CONFIRMED_BOOKING_STATUSES,
    });
    if (booked && booked.status !== 'BLOCKED') {
      return {
        error: `На эти даты уже есть подтверждённая бронь (${booked.startDate.toLocaleDateString('ru-RU', { timeZone: BOOKING_TIME_ZONE })} – ${booked.endDate.toLocaleDateString('ru-RU', { timeZone: BOOKING_TIME_ZONE })})`,
      } as const;
    }
    const block = await tx.equipmentBlock.create({
      data: { equipmentId: machine.id, from, to, reason: parsed.data.reason?.trim() || null },
    });
    return { block } as const;
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ block: blockToJson(result.block) }, { status: 201 });
}
