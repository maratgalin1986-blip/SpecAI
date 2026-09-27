import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

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

/** Бронирования текущего пользователя (клиента), новые сверху. */
export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const bookings = await prisma.booking.findMany({
    where: { customerId: currentUser.id },
    include: {
      equipment: { select: { id: true, name: true, imageUrls: true } },
      payment: { select: { status: true } },
      review: { select: { id: true, rating: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ bookings });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { equipmentId, startDate, endDate, deliveryLocationId, notes } = parsed.data;

  const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!equipment) {
    return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
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
    return NextResponse.json({ error: 'Техника недоступна на выбранные даты' }, { status: 409 });
  }

  const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
  const totalPrice = Number(equipment.dailyRate) * days;

  const booking = await prisma.booking.create({
    data: {
      equipmentId,
      customerId: currentUser.id,
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
