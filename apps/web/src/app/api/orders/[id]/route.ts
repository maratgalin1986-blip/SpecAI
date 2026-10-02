import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider, isHouseManager } from '@/lib/fleet';
import { customerShortName } from '@/lib/customerPrivacy';
import { updateOrderSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';

export const dynamic = 'force-dynamic';

/**
 * Заявка с предложениями исполнителей (техника, цена, сообщение).
 * Как и страница /orders/[id], доступна автору и любому исполнителю: автор
 * видит все предложения, исполнитель — только свои и «Заказчик А.» без id
 * аккаунта. `isOwner` подсказывает клиенту, можно ли принимать предложение.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      category: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      location: { select: { addressLine: true, city: true, latitude: true, longitude: true } },
      bids: {
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              imageUrls: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { price: 'asc' },
      },
    },
  });
  const isManager = isProvider(currentUser);
  if (
    !order ||
    order.status === 'PENDING_REVIEW' ||
    (order.customerId !== currentUser.id && !isManager)
  ) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  // Aggregator privacy (152-ФЗ): contacts of people from messenger chats are
  // for СпецПласт16 only; the customer sees every bid, a provider sees only
  // its own bids and their count, and never the customer's name.
  const isOwner = order.customerId === currentUser.id;
  const {
    contactName,
    contactPhone,
    rawText,
    sourceUrl,
    externalId,
    fingerprint,
    customerId,
    ...rest
  } = order;
  const contact = isHouseManager(currentUser)
    ? { contactName, contactPhone, rawText, sourceUrl }
    : {};
  void externalId;
  void fingerprint;
  const bids = isOwner
    ? rest.bids
    : rest.bids.filter((bid) => bid.equipment.company.id === currentUser.companyId);
  return NextResponse.json({
    order: {
      ...rest,
      ...(isOwner ? { customerId } : {}),
      ...contact,
      customer: isOwner ? rest.customer : { name: customerShortName(rest.customer.name) },
      bids,
      bidCount: rest.bids.length,
    },
    isOwner,
  });
}

/**
 * Заказчик отменяет свою открытую заявку: { status: 'CANCELLED' }. Ожидающие
 * предложения отклоняются. Заявку с выбранным исполнителем отменяют через бронь.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, customerId: true, status: true },
  });
  if (!order || order.customerId !== currentUser.id) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  const cancelled = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    });
    if (count > 0) {
      await tx.bid.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
    }
    return count > 0;
  });
  if (!cancelled) {
    return NextResponse.json(
      {
        error:
          order.status === 'MATCHED'
            ? 'Исполнитель уже выбран — отмените бронь в личном кабинете'
            : 'Заявка уже закрыта',
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, message: 'Заявка отменена' });
}
