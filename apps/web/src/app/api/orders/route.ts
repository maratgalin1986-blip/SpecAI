import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createOrderSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { geocodeAddress } from '@/lib/geo';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
import { machineTypeOf } from '@/lib/equipmentCatalog';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkBookingDates } from '@/lib/bookingRules';
import { customerShortName } from '@/lib/customerPrivacy';
import {
  assessWork,
  CHELNY,
  fetchForecast,
  machineGroup,
  mskParts,
  shiftWeather,
  weatherLine,
} from '@/lib/weather';

export const dynamic = 'force-dynamic';

/**
 * Список заявок.
 * - `?open=1` — открытые заявки всех заказчиков (лента для любого исполнителя).
 * - без параметра — все заявки текущего пользователя (любого статуса), требует входа;
 *   используется вкладкой «Заявки» мобильного приложения.
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
  let where: { status?: 'OPEN'; categoryId?: string; customerId?: string };
  if (openFeed) {
    if (!isProvider(currentUser)) {
      return NextResponse.json({ error: 'Доступно только поставщикам' }, { status: 403 });
    }
    where = { status: 'OPEN', categoryId };
  } else {
    where = { customerId: currentUser.id, categoryId };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      bids: { include: { equipment: { select: { companyId: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Never expose contacts of people whose requests were imported from chats.
  // In the open feed a provider sees only its own bids (and how many there
  // are), the customer only as «Анна П.» and without the account id:
  // competitors' prices and the customer's identity stay private.
  const safeOrders = orders.map(
    ({ contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint, ...order }) => {
      void [contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint];
      if (order.customerId === currentUser.id) return { ...order, bidCount: order.bids.length };
      const { customerId, customer, ...rest } = order;
      void customerId;
      return {
        ...rest,
        customer: { name: customerShortName(customer.name) },
        bids: order.bids.filter((bid) => bid.equipment.companyId === currentUser.companyId),
        bidCount: order.bids.length,
      };
    },
  );
  return NextResponse.json({ orders: safeOrders });
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
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const dates = checkBookingDates(parsed.data.desiredStartDate, parsed.data.desiredEndDate);
  if (!dates.ok) {
    return NextResponse.json({ error: dates.error }, { status: 400 });
  }

  // The work site: geocoded once here, used for the weather and the map.
  const address = parsed.data.address;
  const place = address ? await geocodeAddress(address) : null;
  const location = address
    ? await prisma.location.create({
        data: {
          addressLine: address,
          city: place?.city ?? SITE.city,
          country: 'Россия',
          latitude: place?.lat ?? null,
          longitude: place?.lon ?? null,
        },
      })
    : null;

  const order = await prisma.order.create({
    data: {
      customerId: currentUser.id,
      description: parsed.data.description,
      desiredStartDate: parsed.data.desiredStartDate,
      desiredEndDate: parsed.data.desiredEndDate,
      categoryId: parsed.data.categoryId,
      locationId: location?.id,
    },
    include: { category: true },
  });

  await notifyTelegram(await orderMessage(order, place, request.nextUrl.origin));

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
  const where = place ?? { ...CHELNY, label: SITE.city };
  const points = await fetchForecast(where.lat, where.lon);
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
