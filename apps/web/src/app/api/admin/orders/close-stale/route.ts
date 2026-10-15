import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { staleOrdersWhere } from '@/lib/adminOrders';
import { todayStartMsk } from '@/lib/providerFeed';

export const dynamic = 'force-dynamic';

/**
 * «Закрыть все» in /admin/funnel: open orders whose dates have passed leave
 * the board (CANCELLED) and their pending bids are rejected, as on a single
 * «Закрыть». Booked (MATCHED) orders are never touched.
 */
export async function POST() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const where = staleOrdersWhere(todayStartMsk());
  const closed = await prisma
    .$transaction(async (tx) => {
      const ids = (await tx.order.findMany({ where, select: { id: true }, take: 2000 })).map(
        (order) => order.id,
      );
      if (ids.length === 0) return 0;
      const { count } = await tx.order.updateMany({
        where: { ...where, id: { in: ids } },
        data: { status: 'CANCELLED' },
      });
      await tx.bid.updateMany({
        where: { orderId: { in: ids }, status: 'PENDING', order: { status: 'CANCELLED' } },
        data: { status: 'REJECTED' },
      });
      return count;
    })
    .catch(() => null);
  if (closed === null) return NextResponse.json({ error: 'Не удалось закрыть' }, { status: 500 });
  return NextResponse.json({ ok: true, closed });
}
