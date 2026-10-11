import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';

const schema = z.object({ status: z.enum(['OPEN', 'CANCELLED']) });

// Moderation of orders imported from messengers: publish to the board or reject.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  const order = await prisma.order
    .update({ where: { id: params.id }, data: { status: parsed.data.status } })
    .catch(() => null);
  if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  // Published from moderation: now providers hear about it.
  if (order.status === 'OPEN') await notifyProvidersAboutOrder(order.id);
  return NextResponse.json({ ok: true });
}
