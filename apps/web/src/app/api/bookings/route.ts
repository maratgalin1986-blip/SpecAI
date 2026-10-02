import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import {
  BLOCKING_BOOKING_STATUSES,
  checkBookingDates,
  unavailableEquipmentMessage,
} from '@/lib/bookingRules';
import { findOverlappingBooking, lockEquipment } from '@/lib/bookingConflicts';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson, zodErrorMessage } from '@/lib/apiInput';
import { isOnlinePaymentEnabled } from '@/lib/stripe';
import { isProvider } from '@/lib/fleet';

export const dynamic = 'force-dynamic';

const createBookingRequestSchema = z.object({
  // Not a cuid: the owner's own fleet uses readable ids like "sp16-jcb-4cx".
  equipmentId: z
    .string({ required_error: 'Не выбрана техника' })
    .min(1, 'Не выбрана техника')
    .max(64, 'Техника не найдена'),
  startDate: z.coerce.date({ errorMap: () => ({ message: 'Укажите дату начала аренды' }) }),
  endDate: z.coerce.date({ errorMap: () => ({ message: 'Укажите дату окончания аренды' }) }),
  deliveryLocationId: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000, 'Комментарий слишком длинный (до 2000 знаков)').optional(),
});

/**
 * Бронирования текущего пользователя (клиента), новые сверху.
 * `?as=provider` — бронирования техники компании поставщика (с данными клиента).
 * `paymentsEnabled` — подключена ли онлайн-оплата (иначе кнопку «Оплатить» не показывать).
 */
export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const paymentsEnabled = isOnlinePaymentEnabled();

  if (request.nextUrl.searchParams.get('as') === 'provider') {
    if (!isProvider(currentUser)) {
      return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
    }

    const bookings = await prisma.booking.findMany({
      where: { equipment: { companyId: currentUser.companyId } },
      include: {
        equipment: { select: { id: true, name: true, imageUrls: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ bookings, paymentsEnabled });
  }

  const bookings = await prisma.booking.findMany({
    where: { customerId: currentUser.id },
    include: {
      equipment: { select: { id: true, name: true, imageUrls: true } },
      payment: { select: { status: true, refundRequired: true } },
      review: { select: { id: true, rating: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ bookings, paymentsEnabled });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const { equipmentId, deliveryLocationId, notes } = parsed.data;
  const dates = checkBookingDates(parsed.data.startDate, parsed.data.endDate);
  if (!dates.ok) {
    return NextResponse.json({ error: dates.error }, { status: 400 });
  }
  const { startDate, endDate, days } = dates;

  if (deliveryLocationId) {
    const location = await prisma.location.findUnique({
      where: { id: deliveryLocationId },
      select: { id: true },
    });
    if (!location) {
      return NextResponse.json({ error: 'Адрес доставки не найден' }, { status: 400 });
    }
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // Parallel requests for this machine queue here, so the overlap check
      // and the insert below cannot interleave with another request's.
      await lockEquipment(tx, equipmentId);

      const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
      if (!equipment) {
        return { status: 404, error: 'Техника не найдена' } as const;
      }
      const unavailable = unavailableEquipmentMessage(equipment.status);
      if (unavailable) {
        return { status: 409, error: unavailable } as const;
      }

      const overlapping = await findOverlappingBooking(tx, {
        equipmentId,
        startDate,
        endDate,
        statuses: BLOCKING_BOOKING_STATUSES,
      });
      if (overlapping) {
        return {
          status: 409,
          error: 'Техника уже забронирована на эти даты — выберите другие',
        } as const;
      }

      const booking = await tx.booking.create({
        data: {
          equipmentId,
          customerId: currentUser.id,
          startDate,
          endDate,
          totalPrice: Number(equipment.dailyRate) * days,
          currency: equipment.currency,
          deliveryLocationId,
          notes,
        },
      });
      return { status: 201, booking } as const;
    });
  } catch (error) {
    if (prismaErrorCode(error) === 'P2003') {
      return NextResponse.json({ error: 'Указаны несуществующие данные' }, { status: 400 });
    }
    throw error;
  }

  if (result.status !== 201) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ booking: result.booking }, { status: 201 });
}
