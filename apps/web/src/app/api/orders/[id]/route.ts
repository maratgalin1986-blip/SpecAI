import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

/**
 * Заявка с предложениями поставщиков (техника, компания, цена, сообщение).
 * Как и страница /orders/[id] на сайте, доступна любому вошедшему пользователю;
 * `isOwner` подсказывает клиенту, можно ли принимать предложения.
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
  if (!order || order.status === 'PENDING_REVIEW') {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  // Contacts of people from messenger chats are for equipment providers only.
  const { contactName, contactPhone, rawText, sourceUrl, externalId, fingerprint, ...rest } = order;
  const contact =
    currentUser.role === 'PROVIDER_ADMIN' ? { contactName, contactPhone, rawText, sourceUrl } : {};
  void externalId;
  void fingerprint;
  return NextResponse.json({
    order: { ...rest, ...contact },
    isOwner: order.customerId === currentUser.id,
  });
}
