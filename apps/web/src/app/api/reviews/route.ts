import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createReviewSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson, zodErrorMessage } from '@/lib/apiInput';
import { prepareCommentText } from '@/lib/comments';
import { notifyTelegram } from '@/lib/notify';

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

  // The text goes through the same rules as comments (contacts and links
  // hidden) and waits for moderation; the stars count at once.
  let text: string | null = null;
  if (parsed.data.comment?.trim()) {
    const prepared = prepareCommentText(parsed.data.comment);
    if (!prepared.ok) {
      return NextResponse.json(
        { error: prepared.error.replace('Комментарий', 'Текст отзыва') },
        { status: 400 },
      );
    }
    text = prepared.text;
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
        comment: text,
        textStatus: text ? 'PENDING' : 'APPROVED',
      },
    });
  } catch (error) {
    // Two parallel submissions: the unique bookingId lets only one through.
    if (prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'На это бронирование уже есть отзыв' }, { status: 409 });
    }
    throw error;
  }

  if (text) {
    await notifyTelegram(
      `⭐ Новый отзыв (${review.rating}/5) ждёт проверки: ${booking.equipment.name}\n«${text.slice(0, 300)}»`,
    ).catch(() => undefined);
  }

  return NextResponse.json(
    {
      review,
      message: text
        ? 'Спасибо! Оценка уже видна, текст отзыва появится после проверки'
        : 'Спасибо за оценку!',
    },
    { status: 201 },
  );
}
