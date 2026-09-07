import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { createOrderSchema } from '@specai/shared';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get('categoryId') ?? undefined;

  const orders = await prisma.order.findMany({
    where: { status: 'OPEN', categoryId },
    include: { category: true, customer: true, bids: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.create({
    data: {
      customerId: session.user.id,
      description: parsed.data.description,
      desiredStartDate: parsed.data.desiredStartDate,
      desiredEndDate: parsed.data.desiredEndDate,
      categoryId: parsed.data.categoryId,
    },
  });

  return NextResponse.json({ order }, { status: 201 });
}
