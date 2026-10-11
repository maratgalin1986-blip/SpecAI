import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { getRequestUser } from '@/lib/requestUser';
import { ERASED_ORDER_DATA } from '@/lib/chatOrders';

export const dynamic = 'force-dynamic';

/**
 * «Удалить по запросу»: автор сообщения из чата попросил убрать заявку.
 * Заявка закрывается, имя, телефон, исходный текст и ссылка стираются,
 * ожидающие предложения отклоняются. Журнал показов телефона остаётся
 * (в нём нет самого номера) — видно, кто успел его открыть.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getRequestUser(request).catch(() => null);
  if (!isAdminRequest() && user?.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, source: true },
  });
  if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  if (order.source === 'SITE') {
    return NextResponse.json(
      { error: 'Заявку с сайта отменяет её автор в личном кабинете' },
      { status: 400 },
    );
  }
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: ERASED_ORDER_DATA }),
    prisma.bid.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    }),
  ]);
  return NextResponse.json({ ok: true, message: 'Заявка удалена, контакты стёрты' });
}
