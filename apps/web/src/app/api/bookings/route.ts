import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';

const createBookingRequestSchema = z
  .object({
    equipmentId: z.string().cuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    deliveryLocationId: z.string().cuid().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { equipmentId, startDate, endDate, deliveryLocationId, notes } = parsed.data;

  const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!equipment) {
    return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });
  }

  const overlapping = await prisma.booking.findFirst({
    where: {
      equipmentId,
      status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: 'Equipment is not available for the selected dates' },
      { status: 409 },
    );
  }

  const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
  const totalPrice = Number(equipment.dailyRate) * days;

  const booking = await prisma.booking.create({
    data: {
      equipmentId,
      customerId: session.user.id,
      startDate,
      endDate,
      totalPrice,
      currency: equipment.currency,
      deliveryLocationId,
      notes,
    },
  });

  return NextResponse.json({ booking }, { status: 201 });
}
