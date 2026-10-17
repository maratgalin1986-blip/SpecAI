import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { newBidReceived } from '@/lib/emailTemplates';
import { notifyTelegram } from '@/lib/notify';
import { formatMoney } from '@/lib/money';
import { siteUrl } from '@/lib/siteUrl';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { BLOCKING_BOOKING_STATUSES, unavailableEquipmentMessage } from '@/lib/bookingRules';
import { findOverlappingBooking } from '@/lib/bookingConflicts';
import { isProvider } from '@/lib/fleet';
import { notifyCompany, notifyUser } from '@/lib/notifications/notifyUser';
import { isRealEmail } from '@/lib/notifications/routing';
import { HOUSE_COMPANY_ID } from '@/lib/fleet';
import { bidBreakdownSchema, type BidBreakdownInput } from '@specai/shared';
import {
  bidSumMatches,
  bidTotal,
  houseFloorError,
  orderDays,
  shiftsOverDaysError,
} from '@/lib/offerBreakdown';
import { bidShiftFloor } from '@/lib/equipmentCatalog';
import { isLateBid } from '@/lib/bidWindow';
import { maskContactsAndLinks } from '@/lib/privacy';

const requestSchema = z.object({
  // Not a cuid: the owner's own fleet uses readable ids like "sp16-jcb-4cx".
  equipmentId: z
    .string({ required_error: 'Выберите технику' })
    .min(1, 'Выберите технику')
    .max(64, 'Техника не найдена'),
  price: z
    .number({ invalid_type_error: 'Укажите цену числом', required_error: 'Укажите цену' })
    .positive('Цена должна быть больше нуля')
    .max(99_999_999, 'Слишком большая цена'),
  message: z.string().max(1000, 'Сообщение слишком длинное (до 1000 знаков)').optional(),
});

/** The breakdown columns of a bid from the request (lib/offerBreakdown.ts). */
function breakdownData(data: BidBreakdownInput) {
  return {
    deliveryPrice: data.deliveryPrice ?? null,
    shiftPrice: data.shiftPrice ?? null,
    shifts: data.shifts ?? null,
    optionsNote: data.optionsNote?.trim() || null,
  };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
  }

  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = requestSchema.merge(bidBreakdownSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  // A shift price without the number of shifts (or the reverse) would skip
  // the sum check and store an offer the customer cannot read.
  if ((parsed.data.shiftPrice === undefined) !== (parsed.data.shifts === undefined)) {
    return NextResponse.json({ error: 'Укажите и цену смены, и число смен' }, { status: 400 });
  }
  // The total must be what the breakdown says: подача + смена × смен.
  if (!bidSumMatches(parsed.data.price, parsed.data)) {
    return NextResponse.json(
      {
        error: `Итог не сходится: подача + смена × смен = ${formatMoney(
          bidTotal(parsed.data.deliveryPrice, parsed.data.shiftPrice!, parsed.data.shifts!),
        )}`,
      },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { customer: { select: { email: true, companyId: true } } },
  });
  if (!order || order.status !== 'OPEN') {
    return NextResponse.json({ error: 'Заявка не найдена или уже закрыта' }, { status: 404 });
  }
  // No offers on the company's own orders: a self-made deal would count as a
  // completed order and let the company rate itself.
  if (
    order.customerId === currentUser.id ||
    (!!currentUser.companyId && order.customer.companyId === currentUser.companyId)
  ) {
    return NextResponse.json(
      { error: 'Нельзя предлагать технику на собственную заявку' },
      { status: 403 },
    );
  }
  // The breakdown cannot promise more shifts than the order has days.
  const days = orderDays(order.desiredStartDate, order.desiredEndDate);
  const shiftsError = shiftsOverDaysError(parsed.data.shifts, days);
  if (shiftsError) {
    return NextResponse.json({ error: shiftsError, days }, { status: 400 });
  }
  // After bidsUntil the bid is still taken, but marked late for the customer.
  const late = isLateBid(order.bidsUntil);
  const lateNote = late ? ' — срок приёма предложений истёк, заказчик всё равно его увидит' : '';

  const equipment = await prisma.equipment.findUnique({
    where: { id: parsed.data.equipmentId },
    include: { category: { select: { name: true } } },
  });
  if (!equipment || equipment.companyId !== currentUser.companyId) {
    return NextResponse.json(
      { error: 'Можно предлагать только собственную технику' },
      { status: 403 },
    );
  }
  const unavailable = unavailableEquipmentMessage(equipment.status);
  if (unavailable) {
    return NextResponse.json(
      { error: `${unavailable} — предложить можно только доступную технику` },
      { status: 409 },
    );
  }
  // СпецПласт16's own machines are offered at no less than the shift price
  // the customer already sees on the card (lib/equipmentCatalog.ts), so one
  // machine never shows two prices; other providers set their own prices. A
  // low price is refused with the minimum, never raised silently.
  const floorError = houseFloorError(
    parsed.data,
    bidShiftFloor({ ...equipment, categoryName: equipment.category.name }),
    days,
  );
  if (floorError) {
    return NextResponse.json({ error: floorError }, { status: 400 });
  }

  // The machine must be free on the order's dates.
  const busy = await findOverlappingBooking(prisma, {
    equipmentId: equipment.id,
    startDate: order.desiredStartDate,
    endDate: order.desiredEndDate,
    statuses: BLOCKING_BOOKING_STATUSES,
  });
  if (busy) {
    return NextResponse.json(
      {
        error: `«${equipment.name}» уже забронирована на ${busy.startDate.toLocaleDateString('ru-RU')} – ${busy.endDate.toLocaleDateString('ru-RU')} — предложите другую машину`,
      },
      { status: 409 },
    );
  }

  // One bid per company on an order: a repeat updates the pending bid
  // (price, machine, message) instead of adding another one.
  const message = parsed.data.message?.trim() || null;
  const previous = await prisma.bid.findFirst({
    where: {
      orderId: order.id,
      status: 'PENDING',
      equipment: { companyId: currentUser.companyId },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (previous) {
    const bid = await prisma.bid.update({
      where: { id: previous.id },
      data: {
        equipmentId: equipment.id,
        price: parsed.data.price,
        currency: equipment.currency,
        message,
        ...breakdownData(parsed.data),
      },
    });
    // The customer compares offers: a changed price or machine is news too
    // (one message; for a guest or chat order the house managers relay it).
    try {
      const company = await prisma.company.findUnique({
        where: { id: equipment.companyId },
        select: { name: true },
      });
      const price = formatMoney(bid.price, bid.currency);
      if (isRealEmail(order.customer.email)) {
        await notifyUser(order.customerId, {
          type: 'bid.new',
          orderId: order.id,
          equipmentName: equipment.name,
          price,
          companyName: company?.name,
          updated: true,
        });
      } else {
        await notifyCompany(HOUSE_COMPANY_ID, {
          type: 'bid.relay',
          orderId: order.id,
          equipmentName: equipment.name,
          price,
          companyName: company?.name,
          fromChat: order.source !== 'SITE',
        });
      }
    } catch (error) {
      console.error('[notify] bid updated failed', error);
    }
    return NextResponse.json(
      { bid, late, message: `Предложение обновлено${lateNote}` },
      { status: 200 },
    );
  }

  const bid = await prisma.bid.create({
    data: {
      orderId: order.id,
      equipmentId: equipment.id,
      price: parsed.data.price,
      currency: equipment.currency,
      message,
      ...breakdownData(parsed.data),
    },
  });

  try {
    const template = newBidReceived({
      orderId: order.id,
      orderDescription: order.description,
      equipmentName: equipment.name,
      price: bid.price,
      currency: bid.currency,
      // As on the order page: no phones or links before the booking.
      message: bid.message && maskContactsAndLinks(bid.message),
    });
    // The customer's chosen channels; the e-mail is the newBidReceived letter.
    const company = await prisma.company.findUnique({
      where: { id: equipment.companyId },
      select: { name: true },
    });
    await notifyUser(
      order.customerId,
      {
        type: 'bid.new',
        orderId: order.id,
        equipmentName: equipment.name,
        price: formatMoney(bid.price, bid.currency),
        companyName: company?.name,
      },
      { email: template },
    );
    if (!isRealEmail(order.customer.email)) {
      // Chat-imported and guest orders belong to technical accounts (.invalid
      // e-mail, no channels): nobody would hear of the bid, though the guest
      // was promised a call. СпецПласт16's managers relay it.
      const fromChat = order.source !== 'SITE';
      await notifyTelegram(
        `💰 Предложение по заявке ${fromChat ? 'из чата' : 'гостя с сайта'}: ${equipment.name} — ${formatMoney(bid.price, bid.currency)}\n` +
          (order.contactPhone ? `Позвоните заказчику: ${order.contactPhone}\n` : '') +
          `${order.description.slice(0, 200)}\n${siteUrl()}/orders/${order.id}`,
      );
      await notifyCompany(HOUSE_COMPANY_ID, {
        type: 'bid.relay',
        orderId: order.id,
        equipmentName: equipment.name,
        price: formatMoney(bid.price, bid.currency),
        companyName: company?.name,
        fromChat,
      });
    }
  } catch (error) {
    console.error('[notify] newBidReceived failed', error);
  }

  return NextResponse.json(
    { bid, late, message: `Предложение отправлено${lateNote}` },
    { status: 201 },
  );
}
