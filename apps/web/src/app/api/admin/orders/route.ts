import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** Orders loaded for the app's admin list. */
const ADMIN_ORDERS_TAKE = 50;

/**
 * Orders for the app's admin menu, newest first. By default the ones imported
 * from chats and waiting for moderation (PENDING_REVIEW); `?status=OPEN` lists
 * the open ones. This is the owner, so the chat contact is included. Decisions
 * go through PATCH /api/admin/orders/[id].
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const status = request.nextUrl.searchParams.get('status') === 'OPEN' ? 'OPEN' : 'PENDING_REVIEW';
  const orders = await prisma.order.findMany({
    where: { status },
    select: {
      id: true,
      status: true,
      description: true,
      rawText: true,
      source: true,
      sourceChat: true,
      sourceUrl: true,
      contactName: true,
      contactPhone: true,
      desiredStartDate: true,
      createdAt: true,
      category: { select: { name: true } },
      location: { select: { city: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: ADMIN_ORDERS_TAKE,
  });
  return NextResponse.json({ orders });
}
