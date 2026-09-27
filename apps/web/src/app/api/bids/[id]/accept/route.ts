import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { sendEmail } from '@/lib/email';
import { bidAccepted } from '@/lib/emailTemplates';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const bid = await prisma.bid.findUnique({
    where: { id: params.id },
    include: {
      order: { include: { customer: { select: { name: true } } } },
      equipment: {
        include: {
          company: {
            select: {
              users: { where: { role: 'PROVIDER_ADMIN' }, select: { email: true } },
            },
          },
        },
      },
    },
  });

  if (!bid || bid.order.customerId !== currentUser.id) {
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

  try {
    const providerEmails = bid.equipment.company.users.map((user) => user.email);
    if (providerEmails.length > 0) {
      const template = bidAccepted({
        bookingId: booking.id,
        equipmentName: bid.equipment.name,
        price: booking.totalPrice,
        currency: booking.currency,
        startDate: booking.startDate,
        endDate: booking.endDate,
        customerName: bid.order.customer.name,
      });
      await sendEmail({ to: providerEmails, ...template });
    }
  } catch (error) {
    console.error('[email] bidAccepted failed', error);
  }

  return NextResponse.json({ booking }, { status: 201 });
}
