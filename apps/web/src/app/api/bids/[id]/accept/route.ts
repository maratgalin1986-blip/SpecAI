import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const bid = await prisma.bid.findUnique({
    where: { id: params.id },
    include: { order: true, equipment: true },
  });

  if (!bid || bid.order.customerId !== session.user.id) {
    return NextResponse.json({ error: 'Предложение не найдено' }, { status: 404 });
  }
  if (bid.order.status !== 'OPEN' || bid.status !== 'PENDING') {
    return NextResponse.json({ error: 'Заявка уже закрыта' }, { status: 409 });
  }

  const overlapping = await prisma.booking.findFirst({
    where: {
      equipmentId: bid.equipmentId,
      status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
      startDate: { lt: bid.order.desiredEndDate },
      endDate: { gt: bid.order.desiredStartDate },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: 'Эта техника уже занята на выбранные даты' },
      { status: 409 },
    );
  }

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        equipmentId: bid.equipmentId,
        customerId: bid.order.customerId,
        startDate: bid.order.desiredStartDate,
        endDate: bid.order.desiredEndDate,
        totalPrice: bid.price,
        currency: bid.currency,
        orderId: bid.orderId,
      },
    });

    await tx.bid.update({ where: { id: bid.id }, data: { status: 'ACCEPTED' } });
    await tx.bid.updateMany({
      where: { orderId: bid.orderId, id: { not: bid.id } },
      data: { status: 'REJECTED' },
    });
    await tx.order.update({ where: { id: bid.orderId }, data: { status: 'MATCHED' } });

    return created;
  });

  return NextResponse.json({ booking }, { status: 201 });
}
