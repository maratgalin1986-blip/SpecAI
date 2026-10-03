import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@specai/database';
import { createEquipmentSchema, equipmentSearchQuerySchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { EQUIPMENT_ORDER_BY, totalPagesFor } from '@/lib/pagination';
import { PUBLIC_FLEET, PUBLISHED_FLEET, isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { listingPhoto } from '@/lib/equipmentPhoto';
import { customerRates } from '@/lib/equipmentCatalog';

export async function GET(request: NextRequest) {
  const { mine, ...params } = Object.fromEntries(request.nextUrl.searchParams.entries());
  const ownFleet = mine === '1' || mine === 'true';

  // ?mine=1 — техника компании текущего поставщика (для мобильного кабинета).
  // Заменяет companyId из строки запроса значением из аккаунта.
  if (ownFleet) {
    const currentUser = await getRequestUser(request);
    if (!isProvider(currentUser)) {
      return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
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
    // With ?mine=1 a provider sees its own company's machinery. Public lists
    // are always СпецПласт16's published fleet: the house filter comes last so
    // ?companyId= is ignored there (owner's decision, 2026-10-02).
    ...(ownFleet ? { ...PUBLIC_FLEET, companyId } : PUBLISHED_FLEET),
    ...(status ? { status: ownFleet || status !== 'RETIRED' ? status : { in: [] } } : {}),
    location: city ? { city: { equals: city, mode: 'insensitive' } } : undefined,
    dailyRate:
      minDailyRate !== undefined || maxDailyRate !== undefined
        ? { gte: minDailyRate, lte: maxDailyRate }
        : undefined,
    name: query ? { contains: query, mode: 'insensitive' } : undefined,
  };

  const [total, equipment] = await Promise.all([
    prisma.equipment.count({ where }),
    prisma.equipment.findMany({
      where,
      include: { category: true, location: true, company: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: EQUIPMENT_ORDER_BY[sort],
    }),
  ]);

  // The app shows photoUrl: the machine's own photo or an example one.
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    equipment: equipment.map((item) => ({
      ...item,
      // Customers see prices as on the site (never below lib/prices.ts); the
      // provider's own list keeps the stored ones, which its edit form saves.
      ...(ownFleet ? {} : customerRates({ ...item, categoryName: item.category.name })),
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
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
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
  return NextResponse.json({ equipment }, { status: 201 });
}
