import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { houseFirstBids, isProvider, isHouseManager } from '@/lib/fleet';
import { loadCompanyStats } from '@/lib/companyStats';
import { EMPTY_STATS, reliability } from '@/lib/reliability';
import { customerShortName } from '@/lib/customerPrivacy';
import { maskedContactFor } from '@/lib/chatOrders';
import { updateOrderSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { unreadMessagesByOrder } from '@/lib/orderChatAccess';
import { maskContactsAndLinks } from '@/lib/privacy';
import { bidForCustomer, bookedProviderSees } from '@/lib/bidPrivacy';
import { notifyCompany } from '@/lib/notifications/notifyUser';
import { matchedOrderCancelError } from '@/lib/orderCancel';

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
      booking: { select: { status: true, equipment: { select: { companyId: true } } } },
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
    buyer,
    ...rest
  } = order;
  const contact = isHouseManager(currentUser)
    ? { contactName, contactPhone, rawText, sourceUrl }
    : {};
  // Other providers see the phone of a chat or guest order masked and open
  // it with POST /api/orders/[id]/phone (logged, limited per day).
  const chatContact = maskedContactFor(
    { contactPhone },
    { isProvider: isManager, isHouse: isHouseManager(currentUser) },
  );
  void externalId;
  void fingerprint;
  // Contacts open only with the booked company once it confirmed: until then
  // a provider's message to the customer (and the task text to providers)
  // goes without phones and links.
  // The customer compares offers by trust signals as well as price (as on
  // the web page): «Проверен», rating, completed orders, cancellations.
  const trust = isOwner
    ? await loadCompanyStats(rest.bids.map((bid) => bid.equipment.company.id)).catch(
        () => new Map(),
      )
    : new Map();
  const withTrust = <T extends (typeof rest.bids)[number]>(bid: T) => {
    if (!isOwner) return bid;
    const value = reliability(trust.get(bid.equipment.company.id) ?? EMPTY_STATS);
    return {
      ...bid,
      equipment: {
        ...bid.equipment,
        company: {
          ...bid.equipment.company,
          verified: value.verified,
          rating: value.rating,
          ratingCount: value.ratingCount,
          completed: value.completed,
          cancelShare: value.cancelShare,
          badges: value.badges,
        },
      },
    };
  };
  // СпецПласт16 always leads the list (owner's rule), the rest by price.
  const ordered = houseFirstBids(rest.bids, (bid) => bid.equipment.company.id).map(withTrust);
  const bids = isOwner
    ? ordered.map((bid) => bidForCustomer(bid, rest.booking?.status))
    : ordered.filter((bid) => bid.equipment.company.id === currentUser.companyId);
  const { booking, ...publicRest } = rest;
  void booking;
  // Unread chat messages for the «Открыть чат» badges in the app.
  const unread = await unreadMessagesByOrder([order.id], currentUser).catch(
    () => new Map<string, number>(),
  );
  return NextResponse.json({
    order: {
      ...publicRest,
      ...(isOwner || bookedProviderSees(rest.booking, currentUser.companyId)
        ? {}
        : { description: maskContactsAndLinks(rest.description) }),
      // Requisites «Заказываю от …»: the customer's own; the provider reads them
      // on the confirmed booking (GET /api/bookings?as=provider).
      ...(isOwner ? { customerId, buyer } : {}),
      ...contact,
      ...(chatContact ? { chatContact } : {}),
      customer: isOwner ? rest.customer : { name: customerShortName(rest.customer.name) },
      bids,
      bidCount: rest.bids.length,
      unreadMessages: unread.get(order.id) ?? 0,
    },
    isOwner,
  });
}

/**
 * Заказчик отменяет свою открытую заявку: { status: 'CANCELLED' }. Ожидающие
 * предложения отклоняются, их авторы получают уведомление. Заявку с выбранным
 * исполнителем отменяют через бронь.
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
    select: {
      id: true,
      customerId: true,
      status: true,
      desiredStartDate: true,
      category: { select: { name: true } },
      booking: { select: { status: true } },
    },
  });
  if (!order || order.customerId !== currentUser.id) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
  const rejected = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) return null;
    // Whose offers are being turned down: told below, once per company.
    const pending = await tx.bid.findMany({
      where: { orderId: order.id, status: 'PENDING' },
      select: { equipment: { select: { name: true, companyId: true } } },
    });
    await tx.bid.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    return pending;
  });
  if (!rejected) {
    return NextResponse.json(
      {
        error:
          order.status === 'MATCHED'
            ? matchedOrderCancelError(order.booking?.status)
            : 'Заявка уже закрыта',
      },
      { status: 409 },
    );
  }
  // Each company whose bid waited hears of it once (its latest machine named).
  const byCompany = new Map<string, string>();
  for (const bid of rejected) byCompany.set(bid.equipment.companyId, bid.equipment.name);
  for (const [companyId, equipmentName] of byCompany) {
    void notifyCompany(companyId, {
      type: 'order.cancelled',
      orderId: order.id,
      equipmentName,
      categoryName: order.category?.name,
      startDate: order.desiredStartDate,
    }).catch((error) => console.error('[notify] order cancelled failed', error));
  }
  return NextResponse.json({ ok: true, message: 'Заявка отменена' });
}
