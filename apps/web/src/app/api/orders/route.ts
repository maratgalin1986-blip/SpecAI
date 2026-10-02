import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createOrderSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { orderViewerFor } from '@/lib/orderViewer';
import { canSeeCustomerName, orderDescriptionFor, visibleBids } from '@/lib/privacy';

export const dynamic = 'force-dynamic';

/**
 * Список заявок.
 * - `?open=1` — открытые заявки всех клиентов (лента для поставщиков), как раньше.
 * - без параметра — все заявки текущего пользователя (любого статуса), требует входа;
 *   используется вкладкой «Заявки» мобильного приложения.
 * Формат ответа один и тот же: `{ orders }` с category, bids и bidCount. customer
 * (id, name) и все ставки видят только автор заявки и админ; поставщик видит свои
 * ставки, остальные — только их число (bidCount).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const openFeed = searchParams.get('open') === '1';

  const currentUser = await getRequestUser(request);
  let where: { status?: 'OPEN'; categoryId?: string; customerId?: string };
  if (openFeed) {
    where = { status: 'OPEN', categoryId };
  } else {
    if (!currentUser) {
      return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
    }
    where = { customerId: currentUser.id, categoryId };
  }
  const viewer = await orderViewerFor(currentUser);

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

  // Personal data (152-ФЗ): contacts of people from chats are never listed here,
  // the customer's name and the bids with prices go only to those who may see
  // them; everybody gets the number of bids.
  const safeOrders = orders.map(
    ({
      contactName,
      contactPhone,
      rawText,
      sourceUrl,
      externalId,
      fingerprint,
      customer,
      bids,
      ...order
    }) => {
      void [contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint];
      return {
        ...order,
        description: orderDescriptionFor(order, viewer),
        customer: canSeeCustomerName(viewer, order.customerId) ? customer : undefined,
        bids: visibleBids(bids, viewer, order.customerId).map(({ equipment, ...bid }) => {
          void equipment;
          return bid;
        }),
        bidCount: bids.length,
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
