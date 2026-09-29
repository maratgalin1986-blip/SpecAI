import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { sendEmail } from '@/lib/email';
import { bidAccepted } from '@/lib/emailTemplates';
import { prismaErrorCode } from '@/lib/apiInput';
import {
  BLOCKING_BOOKING_STATUSES,
  toBookingDay,
  unavailableEquipmentMessage,
} from '@/lib/bookingRules';
import { findOverlappingBooking, lockEquipment } from '@/lib/bookingConflicts';

/** Thrown inside the transaction to roll it back when the order was taken meanwhile. */
class AlreadyClosedError extends Error {}

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

  const startDate = toBookingDay(bid.order.desiredStartDate);
  const endDate = toBookingDay(bid.order.desiredEndDate);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // Same per-machine lock as POST /api/bookings: the overlap check and the
      // new booking cannot interleave with another booking of this machine.
      await lockEquipment(tx, bid.equipmentId);

      const equipment = await tx.equipment.findUnique({
        where: { id: bid.equipmentId },
        select: { status: true },
      });
      const unavailable = equipment
        ? unavailableEquipmentMessage(equipment.status)
        : 'Техника не найдена';
      if (unavailable) {
        return { error: `${unavailable}. Выберите другое предложение` } as const;
      }

      const overlapping = await findOverlappingBooking(tx, {
        equipmentId: bid.equipmentId,
        startDate,
        endDate,
        statuses: BLOCKING_BOOKING_STATUSES,
      });
      if (overlapping) {
        return {
          error:
            overlapping.status === 'PENDING'
              ? 'Эта техника уже занята на выбранные даты'
              : 'На эти даты у этой техники уже есть подтверждённая бронь',
        } as const;
      }

      // Close the order first and only if it is still open: of two parallel
      // «Принять» clicks exactly one gets past this line.
      const closed = await tx.order.updateMany({
        where: { id: bid.orderId, status: 'OPEN' },
        data: { status: 'MATCHED' },
      });
      const accepted = await tx.bid.updateMany({
        where: { id: bid.id, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (closed.count === 0 || accepted.count === 0) {
        throw new AlreadyClosedError();
      }
      await tx.bid.updateMany({
        where: { orderId: bid.orderId, id: { not: bid.id } },
        data: { status: 'REJECTED' },
      });

      const created = await tx.booking.create({
        data: {
          equipmentId: bid.equipmentId,
          customerId: bid.order.customerId,
          startDate,
          endDate,
          totalPrice: bid.price,
          currency: bid.currency,
          orderId: bid.orderId,
        },
      });
      return { booking: created } as const;
    });
  } catch (error) {
    if (error instanceof AlreadyClosedError || prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'Заявка уже закрыта' }, { status: 409 });
    }
    throw error;
  }
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  const { booking } = result;

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
