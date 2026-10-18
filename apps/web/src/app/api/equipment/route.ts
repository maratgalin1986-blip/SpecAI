import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@specai/database';
import { createEquipmentSchema, equipmentSearchQuerySchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { EQUIPMENT_ORDER_BY, totalPagesFor } from '@/lib/pagination';
import { freshFirst } from '@/lib/aktualno';
import { PUBLIC_FLEET, PUBLISHED_FLEET, isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { listingPhoto } from '@/lib/equipmentPhoto';
import { maskContactsAndLinks, containsContact } from '@/lib/privacy';
import { customerRateFields, customerRates } from '@/lib/equipmentCatalog';
import { pingNewMachine } from '@/lib/indexNow';

export async function GET(request: NextRequest) {
  const { mine, ...params } = Object.fromEntries(request.nextUrl.searchParams.entries());
  const ownFleet = mine === '1' || mine === 'true';

  // ?mine=1 — техника компании текущего поставщика (для мобильного кабинета).
  // Заменяет companyId из строки запроса значением из аккаунта.
  if (ownFleet) {
    const currentUser = await getRequestUser(request);
    if (!isProvider(currentUser)) {
      return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
    }
    params.companyId = currentUser.companyId;
  }

  const parsed = equipmentSearchQuerySchema.safeParse({
    ...params,
    minDailyRate: params.minDailyRate ? Number(params.minDailyRate) : undefined,
    maxDailyRate: params.maxDailyRate ? Number(params.maxDailyRate) : undefined,
    page: params.page ? Number(params.page) : undefined,
    pageSize: params.pageSize ? Number(params.pageSize) : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const {
    categoryId,
    companyId,
    status,
    city,
    minDailyRate,
    maxDailyRate,
    query,
    page,
    pageSize,
    sort,
  } = parsed.data;

  const where: Prisma.EquipmentWhereInput = {
    categoryId,
    // The provider's own list shows everything, including listings taken off
    // the site; public lists never show RETIRED.
    ...(ownFleet ? PUBLIC_FLEET : PUBLISHED_FLEET),
    // ?companyId= — one provider's machinery (its page and the map); with
    // ?mine=1 it is the signed-in provider's own company.
    companyId,
    ...(status ? { status: ownFleet || status !== 'RETIRED' ? status : { in: [] } } : {}),
    location: city ? { city: { equals: city, mode: 'insensitive' } } : undefined,
    dailyRate:
      minDailyRate !== undefined || maxDailyRate !== undefined
        ? { gte: minDailyRate, lte: maxDailyRate }
        : undefined,
    name: query ? { contains: query, mode: 'insensitive' } : undefined,
  };

  const [total, loaded] = await Promise.all([
    prisma.equipment.count({ where }),
    prisma.equipment.findMany({
      where,
      include: {
        category: true,
        location: true,
        company: { select: { id: true, name: true, verified: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: EQUIPMENT_ORDER_BY[sort],
    }),
  ]);

  // «Актуализация»: as in the site's catalogue, fresh answers a bit higher in
  // the default order (house fleet still first); the provider's own list as stored.
  const equipment = sort === 'newest' && !ownFleet ? freshFirst(loaded, new Date()) : loaded;
  // The app shows photoUrl: the machine's own photo or an example one.
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    equipment: equipment.map((item) => ({
      ...item,
      // Customers see prices as on the site (the house fleet never below
      // lib/prices.ts); the provider's own list keeps the stored ones, which
      // its edit form saves. customerHourlyRate/customerDailyRate are what
      // the customer sees either way: the bid forms prefill from them.
      ...(ownFleet ? {} : customerRates({ ...item, categoryName: item.category.name })),
      // Contacts in the description stay hidden from customers, as on the
      // machine page; the provider's own list keeps the text it edits.
      ...(ownFleet || !item.description
        ? {}
        : { description: maskContactsAndLinks(item.description) }),
      ...customerRateFields({ ...item, categoryName: item.category.name }),
      ...listingPhoto(item, origin),
    })),
    total,
    page,
    pageSize,
    totalPages: totalPagesFor(total, pageSize),
  });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
  }

  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  // companyId is always derived from the authenticated provider, never trusted from the client.
  const parsed = createEquipmentSchema.safeParse({ ...body, companyId: currentUser.companyId });

  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  if (containsContact(parsed.data.name)) {
    return NextResponse.json(
      {
        error:
          'Уберите телефон, почту и ссылки из названия: контакты откроются заказчику после подтверждения брони',
      },
      { status: 400 },
    );
  }
  const category = await prisma.equipmentCategory.findUnique({
    where: { id: parsed.data.categoryId },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ error: 'Выберите категорию из списка' }, { status: 400 });
  }

  const equipment = await prisma.equipment.create({
    data: {
      ...parsed.data,
      specs: parsed.data.specs as Prisma.InputJsonValue | undefined,
    },
  });
  // Yandex hears of the new public page (IndexNow, best-effort); the first
  // machine also brings the company's page (/providers/<id>) into the sitemap.
  const machines = await prisma.equipment
    .count({ where: { companyId: equipment.companyId, status: { not: 'RETIRED' } } })
    .catch(() => 0);
  await pingNewMachine({
    equipmentId: equipment.id,
    companyId: equipment.companyId,
    firstMachine: machines === 1,
  });
  return NextResponse.json({ equipment }, { status: 201 });
}
