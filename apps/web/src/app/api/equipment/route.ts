import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@specai/database';
import { createEquipmentSchema, equipmentSearchQuerySchema } from '@specai/shared';

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
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

  const { categoryId, companyId, status, city, minDailyRate, maxDailyRate, query, page, pageSize } =
    parsed.data;

  const equipment = await prisma.equipment.findMany({
    where: {
      categoryId,
      companyId,
      status,
      location: city ? { city: { equals: city, mode: 'insensitive' } } : undefined,
      dailyRate:
        minDailyRate !== undefined || maxDailyRate !== undefined
          ? { gte: minDailyRate, lte: maxDailyRate }
          : undefined,
      name: query ? { contains: query, mode: 'insensitive' } : undefined,
    },
    include: { category: true, location: true, company: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ equipment });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createEquipmentSchema.safeParse(body);

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
