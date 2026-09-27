import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createOrderSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

/**
 * Список заявок.
 * - `?open=1` — открытые заявки всех клиентов (лента для поставщиков), как раньше.
 * - без параметра — все заявки текущего пользователя (любого статуса), требует входа;
 *   используется вкладкой «Заявки» мобильного приложения.
 * Формат ответа один и тот же: `{ orders }` с category, customer (id, name) и bids.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const openFeed = searchParams.get('open') === '1';

  let where: { status?: 'OPEN'; categoryId?: string; customerId?: string };
  if (openFeed) {
    where = { status: 'OPEN', categoryId };
  } else {
    const currentUser = await getRequestUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
    }
    where = { customerId: currentUser.id, categoryId };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      bids: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.create({
    data: {
      customerId: currentUser.id,
      description: parsed.data.description,
      desiredStartDate: parsed.data.desiredStartDate,
      desiredEndDate: parsed.data.desiredEndDate,
      categoryId: parsed.data.categoryId,
    },
  });

  return NextResponse.json({ order }, { status: 201 });
}
