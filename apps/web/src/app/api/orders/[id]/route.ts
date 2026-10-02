import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { isFleetManager } from '@/lib/fleet';

export const dynamic = 'force-dynamic';

/**
 * Заявка с предложением СпецПласт16 (техника, цена, сообщение).
 * Как и страница /orders/[id], доступна только автору и владельцу компании;
 * `isOwner` подсказывает клиенту, можно ли принимать предложение.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      category: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      bids: {
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              imageUrls: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { price: 'asc' },
      },
    },
  });
  const isManager = isFleetManager(currentUser);
  if (
    !order ||
    order.status === 'PENDING_REVIEW' ||
    (order.customerId !== currentUser.id && !isManager)
  ) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  // Contacts of people from messenger chats are for the owner only.
  const { contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint, ...rest } = order;
  const contact = isManager ? { contactName, contactPhone, rawText, sourceUrl } : {};
  void externalId;
  void fingerprint;
  return NextResponse.json({
    order: { ...rest, ...contact },
    isOwner: order.customerId === currentUser.id,
  });
}
