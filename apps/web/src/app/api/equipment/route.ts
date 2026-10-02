import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@specai/database';
import { createEquipmentSchema, equipmentSearchQuerySchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { EQUIPMENT_ORDER_BY, totalPagesFor } from '@/lib/pagination';
import { isFleetManager, OWN_FLEET } from '@/lib/fleet';

export async function GET(request: NextRequest) {
  const { mine, ...params } = Object.fromEntries(request.nextUrl.searchParams.entries());

  // ?mine=1 — техника компании текущего поставщика (для мобильного кабинета).
  // Заменяет companyId из строки запроса значением из аккаунта.
  if (mine === '1' || mine === 'true') {
    const currentUser = await getRequestUser(request);
    if (!isFleetManager(currentUser)) {
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

  void companyId;
  const where: Prisma.EquipmentWhereInput = {
    categoryId,
    ...OWN_FLEET,
    status,
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

  return NextResponse.json({
    equipment,
    total,
    page,
    pageSize,
    totalPages: totalPagesFor(total, pageSize),
  });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isFleetManager(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const body = await request.json();
  // companyId is always derived from the authenticated provider, never trusted from the client.
  const parsed = createEquipmentSchema.safeParse({ ...body, companyId: currentUser.companyId });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const equipment = await prisma.equipment.create({
    data: {
      ...parsed.data,
      specs: parsed.data.specs as Prisma.InputJsonValue | undefined,
    },
  });
  return NextResponse.json({ equipment }, { status: 201 });
}
