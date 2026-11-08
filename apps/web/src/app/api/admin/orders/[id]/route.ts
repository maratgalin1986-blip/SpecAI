import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, type OrderStatus } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { ADMIN_ORDER_FROM } from '@/lib/adminOrders';
import { bidsUntilFor } from '@/lib/bidWindow';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';
import { ADMIN_MODERATOR, aiRejectedRepublishableWhere } from '@/lib/orderModeration';

const schema = z.object({ status: z.enum(['OPEN', 'CANCELLED']) });

// Moderation of orders imported from messengers (publish or reject), and
// closing an open order (a stale one). The change applies only from the
// allowed statuses (lib/adminOrders.ts), checked in the same query, so a
// stale tab cannot republish an erased order or a booked one: 409 instead.
// Closing rejects the pending bids, as the customer's own cancel does.
// The admin also overrides the AI moderator here («Решения ИИ»): an order the
// AI rejected may be published, and every change is marked as the admin's.
// A published order whose bid window is over gets a fresh one.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const status = parsed.data.status;
  const from = ADMIN_ORDER_FROM[status] as OrderStatus[];
  const now = new Date();
  const changed = await prisma
    .$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: {
          id: params.id,
          OR: [
            { status: { in: from } },
            ...(status === 'OPEN' ? [aiRejectedRepublishableWhere(now)] : []),
          ],
        },
        data: { status, moderatedBy: ADMIN_MODERATOR, moderatedAt: now },
      });
      if (count > 0 && status === 'OPEN') {
        const order = await tx.order.findUnique({
          where: { id: params.id },
          select: { desiredStartDate: true, bidsUntil: true },
        });
        if (order && (!order.bidsUntil || order.bidsUntil < now)) {
          await tx.order.update({
            where: { id: params.id },
            data: { bidsUntil: bidsUntilFor(now, order.desiredStartDate) },
          });
        }
      }
      if (count > 0 && status === 'CANCELLED') {
        await tx.bid.updateMany({
          where: { orderId: params.id, status: 'PENDING' },
          data: { status: 'REJECTED' },
        });
      }
      return count;
    })
    .catch(() => null);
  if (changed === null)
    return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  if (changed === 0) {
    const exists = await prisma.order.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    if (!exists) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    return NextResponse.json(
      { error: 'Заявка уже обработана или занята — обновите страницу', status: exists.status },
      { status: 409 },
    );
  }
  // Published from moderation: now providers hear about it.
  if (status === 'OPEN') await notifyProvidersAboutOrder(params.id);
  return NextResponse.json({ ok: true });
}
