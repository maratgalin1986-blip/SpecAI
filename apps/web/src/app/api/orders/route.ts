import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createOrderSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isOperator, isProvider } from '@/lib/fleet';
import { matchIncoming, todayStartMsk } from '@/lib/providerFeed';
import { loadProviderMatch } from '@/lib/providerFeedData';
import { bidsUntilFor } from '@/lib/bidWindow';
import { maskedContactFor } from '@/lib/chatOrders';
import { addressCity, geocodeAddress, parseNear } from '@/lib/geo';
import { notifyTelegram } from '@/lib/notify';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';
import { pingOrderBoard } from '@/lib/indexNow';
import { tickDeferredOrderNotices } from '@/lib/deferredOrderNotices';
import { SITE } from '@/lib/site';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkBookingDates } from '@/lib/bookingRules';
import { orderCategoryId } from '@/lib/orderCategoryData';
import { customerShortName } from '@/lib/customerPrivacy';
import { unreadMessagesByOrder } from '@/lib/orderChatAccess';
import { bidForCustomer } from '@/lib/bidPrivacy';
import { maskContactsAndLinks } from '@/lib/privacy';
import { buyerJson, resolveBuyer } from '@/lib/buyerRequisites';
import {
  assessWork,
  fetchForecast,
  machineGroup,
  mskParts,
  shiftWeather,
  weatherLine,
} from '@/lib/weather';

export const dynamic = 'force-dynamic';
// The feed sends due «Пригласи друга» alerts (lib/deferredOrderNotices.ts):
// an e-mail sent from a GET handler must not land in Next's Data Cache. The
// weather keeps its own explicit revalidate.
export const fetchCache = 'default-no-store';

/** One page of the open feed, and the most a client may ask for. */
const FEED_PAGE = 50;
const FEED_PAGE_MAX = 100;
/** How many open orders the «near» feed checks against the radius at most. */
const NEAR_SCAN = 1000;
/** A company's open orders with its own waiting offers: more is not realistic. */
const OWN_BIDS_MAX = 500;

const ORDER_INCLUDE = {
  category: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  bids: { include: { equipment: { select: { companyId: true } } } },
  booking: { select: { status: true } },
  location: { select: { addressLine: true, city: true, latitude: true, longitude: true } },
} as const;

function intParam(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

/**
 * Список заявок.
 * - `?open=1` — открытые заявки всех заказчиков (лента для любого исполнителя),
 *   постранично: `offset`, `limit` (по умолчанию 50), в ответе `nextOffset`.
 *   `scope=near` — только виды техники компании в её радиусе подачи от базы
 *   (как рассылка о новой заявке). На первой странице сначала идут заявки с
 *   ожидающими предложениями самой компании, какими бы старыми они ни были.
 * - `?open=1&mine=1` — все открытые заявки с ожидающими предложениями своей
 *   компании («Мои предложения» в приложении).
 * - без параметра — все заявки текущего пользователя (любого статуса), требует входа;
 *   используется вкладкой «Заявки» мобильного приложения; постранично так же
 *   (`offset`, `limit`, `nextOffset`).
 * В ленту (с `mine=1` тоже) не попадают заявки, срок работ которых уже прошёл
 * (desiredEndDate раньше сегодняшнего дня по Москве) — правило
 * lib/providerFeed.ts incomingOrdersWhere.
 * Формат ответа один и тот же: `{ orders }` с category, customer (id, name) и bids.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const openFeed = searchParams.get('open') === '1';

  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  let orders;
  let nextOffset: number | null = null;
  const offset = intParam(searchParams.get('offset'), 0, 100_000);
  const limit = intParam(searchParams.get('limit'), FEED_PAGE, FEED_PAGE_MAX) || FEED_PAGE;
  if (openFeed) {
    if (!isProvider(currentUser)) {
      return NextResponse.json({ error: 'Доступно только исполнителям' }, { status: 403 });
    }
    // A provider opening the feed: a tick for the delayed new-order alerts.
    await tickDeferredOrderNotices('feed');
    // Work dates already over: nothing to offer, whoever bid on it.
    const notOver = { desiredEndDate: { gte: todayStartMsk() } };
    const ownBids = {
      status: 'OPEN' as const,
      categoryId,
      ...notOver,
      bids: {
        some: { status: 'PENDING' as const, equipment: { companyId: currentUser.companyId } },
      },
    };
    if (searchParams.get('mine') === '1') {
      orders = await prisma.order.findMany({
        where: ownBids,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: OWN_BIDS_MAX,
      });
    } else {
      // The company's own pending bids lead the first page and are never paged out.
      const own = await prisma.order.findMany({
        where: ownBids,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: OWN_BIDS_MAX,
      });
      const where = {
        status: 'OPEN' as const,
        categoryId,
        ...notOver,
        id: { notIn: own.map((order) => order.id) },
      };
      let page;
      if (searchParams.get('scope') === 'near') {
        // The rule of the new-order alert and the web cabinet's «Входящие
        // заявки» (lib/providerFeed.ts): category family and group, the city's
        // centre when only the city is known.
        const { provider, categoryRows } = currentUser.companyId
          ? await loadProviderMatch(currentUser.companyId)
          : { provider: { categoryIds: [] }, categoryRows: [] };
        const candidates =
          provider.categoryIds.length === 0
            ? []
            : await prisma.order.findMany({
                where,
                include: ORDER_INCLUDE,
                orderBy: { createdAt: 'desc' },
                take: NEAR_SCAN,
              });
        const near = matchIncoming(provider, categoryRows, candidates);
        page = near.slice(offset, offset + limit);
        nextOffset = near.length > offset + limit ? offset + limit : null;
      } else {
        const rows = await prisma.order.findMany({
          where,
          include: ORDER_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit + 1,
        });
        page = rows.slice(0, limit);
        nextOffset = rows.length > limit ? offset + limit : null;
      }
      orders = offset === 0 ? [...own, ...page] : page;
    }
  } else {
    const rows = await prisma.order.findMany({
      where: { customerId: currentUser.id, categoryId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1,
    });
    orders = rows.slice(0, limit);
    nextOffset = rows.length > limit ? offset + limit : null;
  }

  // Never expose contacts of people whose requests were imported from chats.
  // In the open feed a provider sees only its own bids (and how many there
  // are), the customer only as «Анна П.» and without the account id:
  // competitors' prices and the customer's identity stay private.
  const safeOrders = orders.map(
    ({ contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint, ...order }) => {
      void [contactName, rawText, sourceUrl, externalId, fingerprint];
      const { booking, ...withoutBooking } = order;
      if (order.customerId === currentUser.id) {
        // The customer's own list (the app's «Заявки»): offers as on the order page.
        return {
          ...withoutBooking,
          bids: order.bids.map((bid) => bidForCustomer(bid, booking?.status)),
          bidCount: order.bids.length,
        };
      }
      // The buyer's requisites belong to the booked provider only (GET /api/bookings).
      const { customerId, customer, buyer, ...rest } = withoutBooking;
      void [customerId, buyer];
      // A chat or guest order: the phone masked, «Показать телефон» opens it.
      // The house manager too: it works these leads first, and the feed is
      // its only place to call them from the app (every reveal is logged).
      const chatContact = maskedContactFor(
        { contactPhone },
        { isProvider: isProvider(currentUser), isHouse: false },
      );
      return {
        ...rest,
        // Phones typed into the task text stay private until the booking.
        description: maskContactsAndLinks(rest.description),
        ...(chatContact ? { chatContact } : {}),
        customer: { name: customerShortName(customer.name) },
        bids: order.bids.filter((bid) => bid.equipment.companyId === currentUser.companyId),
        bidCount: order.bids.length,
      };
    },
  );
  // Unread chat messages per order, for the badges in the app.
  const unread = await unreadMessagesByOrder(
    orders.map((order) => order.id),
    currentUser,
  ).catch(() => new Map<string, number>());
  return NextResponse.json({
    orders: safeOrders.map((order) => ({ ...order, unreadMessages: unread.get(order.id) ?? 0 })),
    nextOffset,
  });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  // A machinist's account only works its shifts: no public orders in its name.
  if (isOperator(currentUser)) {
    return NextResponse.json(
      { error: 'Аккаунт машиниста не может создавать заявки' },
      { status: 403 },
    );
  }

  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const dates = checkBookingDates(parsed.data.desiredStartDate, parsed.data.desiredEndDate);
  if (!dates.ok) {
    return NextResponse.json({ error: dates.error }, { status: 400 });
  }

  if (parsed.data.categoryId) {
    const category = await prisma.equipmentCategory.findUnique({
      where: { id: parsed.data.categoryId },
      select: { parentId: true, children: { select: { id: true }, take: 1 } },
    });
    if (!category) {
      return NextResponse.json({ error: 'Неизвестный вид техники' }, { status: 400 });
    }
    if (category.children.length > 0) {
      return NextResponse.json({ error: 'Выберите конкретный вид техники' }, { status: 400 });
    }
  }

  // «Заказываю от …»: снимок реквизитов на момент заявки.
  const buyer = await resolveBuyer(
    prisma,
    currentUser.id,
    (body as { legalEntityId?: unknown }).legalEntityId,
  );
  if ('error' in buyer) {
    return NextResponse.json({ error: buyer.error }, { status: 400 });
  }

  // The work site: geocoded once here, used for the weather and the map.
  const address = parsed.data.address;
  // The phone's position (the app sends it when allowed): a bare street is
  // looked up in the customer's town first, else across Russia.
  const near = parseNear((body as { near?: unknown }).near);
  const place = address ? await geocodeAddress(address, { near }) : null;
  const location = address
    ? await prisma.location.create({
        data: {
          addressLine: address,
          // A failed lookup still keeps a city the address names («Елабуга, …»);
          // otherwise the city stays empty (unknown), never a default town.
          city: addressCity(address, place),
          country: 'Россия',
          latitude: place?.lat ?? null,
          longitude: place?.lon ?? null,
        },
      })
    : null;

  // No type: the one the description names, so the right providers hear.
  // A type the customer chose is never replaced, and «Любая» picked by hand
  // (`anyCategory`, the web form and the app) keeps the order open to all.
  const categoryId = await orderCategoryId({
    categoryId: parsed.data.categoryId,
    anyCategory: (body as { anyCategory?: unknown }).anyCategory === true,
    description: parsed.data.description,
  });

  const order = await prisma.order.create({
    data: {
      customerId: currentUser.id,
      description: parsed.data.description,
      desiredStartDate: parsed.data.desiredStartDate,
      desiredEndDate: parsed.data.desiredEndDate,
      categoryId,
      locationId: location?.id,
      bidsUntil: bidsUntilFor(new Date(), dates.startDate),
      buyer: buyerJson(buyer.buyer),
    },
    include: { category: true },
  });

  await notifyTelegram(await orderMessage(order, place, request.nextUrl.origin));
  // Providers with machinery of this category nearby (Telegram, push, e-mail…);
  // Yandex hears that the board changed (IndexNow, best-effort).
  await Promise.all([notifyProvidersAboutOrder(order.id), pingOrderBoard()]);

  return NextResponse.json({ order }, { status: 201 });
}

/** The owner's Telegram message about a new order, with the day's weather. */
async function orderMessage(
  order: {
    id: string;
    description: string;
    desiredStartDate: Date;
    desiredEndDate: Date;
    category: { name: string } | null;
    locationId: string | null;
  },
  place: { lat: number; lon: number; label: string } | null,
  origin: string,
) {
  // The weather only for a known place: no forecast for a town we guessed.
  const points = place ? await fetchForecast(place.lat, place.lon) : null;
  const weather = points
    ? shiftWeather(points, mskParts(order.desiredStartDate.toISOString()).date)
    : null;
  const type = machineTypeOf(order.category?.name ?? '');
  const day = (date: Date) => date.toLocaleDateString('ru-RU');
  return [
    `🧾 Новая заявка на технику — ${SITE.name}`,
    order.category ? `Техника: ${order.category.name}` : null,
    `Когда: ${day(order.desiredStartDate)}${order.desiredEndDate > order.desiredStartDate ? ` – ${day(order.desiredEndDate)}` : ''}`,
    place ? `Где: ${place.label}` : null,
    `Задача: ${order.description}`,
    weather
      ? `Погода на смену: ${weatherLine(weather, assessWork(weather, machineGroup(type)))}`
      : null,
    place
      ? `Карта: https://yandex.ru/maps/?pt=${place.lon.toFixed(6)},${place.lat.toFixed(6)}&z=18&l=map`
      : null,
    `Заявка: ${origin}/orders/${order.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}
