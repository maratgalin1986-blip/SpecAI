import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, type OrderStatus } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { ADMIN_ORDER_FROM } from '@/lib/adminOrders';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';

const schema = z.object({ status: z.enum(['OPEN', 'CANCELLED']) });

// Moderation of orders imported from messengers (publish or reject), and
// closing an open order (a stale one). The change applies only from the
// allowed statuses (lib/adminOrders.ts), checked in the same query, so a
// stale tab cannot republish an erased order or a booked one: 409 instead.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const status = parsed.data.status;
  const from = ADMIN_ORDER_FROM[status] as OrderStatus[];
  const result = await prisma.order
    .updateMany({ where: { id: params.id, status: { in: from } }, data: { status } })
    .catch(() => null);
  if (!result) return NextResponse.json({ error: 'Не удалось сохранить' }, { status: 500 });
  if (result.count === 0) {
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
