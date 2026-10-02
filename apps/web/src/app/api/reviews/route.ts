import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createReviewSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson, zodErrorMessage } from '@/lib/apiInput';

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: zodErrorMessage(parsed.error, 'Поставьте оценку от 1 до 5 и проверьте текст отзыва'),
      },
      { status: 400 },
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { equipment: true, review: true },
  });

  if (!booking || booking.customerId !== currentUser.id) {
    return NextResponse.json({ error: 'Бронирование не найдено' }, { status: 404 });
  }
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: 'Отзыв можно оставить только на завершённое бронирование' },
      { status: 409 },
    );
  }
  if (booking.review) {
    return NextResponse.json({ error: 'На это бронирование уже есть отзыв' }, { status: 409 });
  }

  let review;
  try {
    review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        authorId: currentUser.id,
        companyId: booking.equipment.companyId,
        equipmentId: booking.equipmentId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      },
    });
  } catch (error) {
    // Two parallel submissions: the unique bookingId lets only one through.
    if (prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'На это бронирование уже есть отзыв' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ review }, { status: 201 });
}
