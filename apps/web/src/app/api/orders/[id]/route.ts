import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { orderViewerFor } from '@/lib/orderViewer';
import {
  canSeeChatContacts,
  canSeeCustomerName,
  isSafeHttpUrl,
  orderDescriptionFor,
  visibleBids,
} from '@/lib/privacy';

export const dynamic = 'force-dynamic';

/**
 * Заявка с предложениями поставщиков (техника, компания, цена, сообщение).
 * Доступна любому вошедшему пользователю, но все предложения видят только автор
 * заявки и админ, поставщик — свои (правила в lib/privacy.ts); `isOwner`
 * подсказывает клиенту, можно ли принимать предложения.
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
              companyId: true,
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

  // Personal data (152-ФЗ): chat contacts for admins and verified providers,
  // the customer's name and every bid for the customer and admins, a provider
  // sees only their own bids; everybody gets the number of bids.
  const viewer = await orderViewerFor(currentUser);
  const {
    contactName,
    contactPhone,
    rawText,
    sourceUrl,
    externalId,
    fingerprint,
    customer,
    bids,
    ...rest
  } = order;
  void externalId;
  void fingerprint;
  const contact = canSeeChatContacts(viewer)
    ? { contactName, contactPhone, rawText, sourceUrl: isSafeHttpUrl(sourceUrl) ? sourceUrl : null }
    : {};
  return NextResponse.json({
    order: {
      ...rest,
      ...contact,
      description: orderDescriptionFor(order, viewer),
      customer: canSeeCustomerName(viewer, order.customerId) ? customer : undefined,
      bids: visibleBids(bids, viewer, order.customerId),
      bidCount: bids.length,
    },
    isOwner: order.customerId === currentUser.id,
  });
}
