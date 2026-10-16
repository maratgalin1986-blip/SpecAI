import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { CANCELLED_BY } from '@specai/shared';
import { isAdminRequest } from '@/lib/admin';
import { getRequestUser } from '@/lib/requestUser';
import { ERASED_ORDER_DATA, eraseBlockedByBooking } from '@/lib/chatOrders';
import { notifyCompany } from '@/lib/notifications/notifyUser';

export const dynamic = 'force-dynamic';

/**
 * «Удалить по запросу»: автор сообщения из чата попросил убрать заявку.
 * Заявка закрывается, имя, телефон, исходный текст и ссылка стираются,
 * предложения отклоняются, а ещё не подтверждённая бронь отменяется от имени
 * администратора — иначе исполнитель подтвердил бы бронь по стёртой заявке.
 * Подтверждённую или идущую бронь сначала отменяют вручную. Журнал показов
 * телефона остаётся (в нём нет самого номера) — видно, кто успел его открыть.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getRequestUser(request).catch(() => null);
  if (!isAdminRequest() && user?.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      source: true,
      booking: {
        select: {
          id: true,
          status: true,
          startDate: true,
          equipment: { select: { name: true, companyId: true } },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  if (eraseBlockedByBooking(order.booking?.status)) {
    return NextResponse.json(
      { error: 'По заявке идёт подтверждённая бронь — сначала отмените её' },
      { status: 409 },
    );
  }
  if (order.source === 'SITE') {
    return NextResponse.json(
      { error: 'Заявку с сайта отменяет её автор в личном кабинете' },
      { status: 400 },
    );
  }
  const pendingBooking = order.booking?.status === 'PENDING' ? order.booking : null;
  const [, , cancelled] = await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: ERASED_ORDER_DATA }),
    // Pending offers, and the accepted one behind a pending booking.
    prisma.bid.updateMany({
      where: { orderId: order.id, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'REJECTED' },
    }),
    prisma.booking.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledBy: CANCELLED_BY.ADMIN, cancelledAt: new Date() },
    }),
  ]);
  if (pendingBooking && cancelled.count > 0) {
    // The provider learns the booking is gone. The cancellation is the
    // admin's, so it does not count against the provider (lib/reliability.ts).
    await notifyCompany(pendingBooking.equipment.companyId, {
      type: 'booking.status',
      bookingId: pendingBooking.id,
      equipmentName: pendingBooking.equipment.name,
      status: 'CANCELLED',
      startDate: pendingBooking.startDate,
      audience: 'provider',
    });
  }
  return NextResponse.json({
    ok: true,
    message:
      cancelled.count > 0
        ? 'Заявка удалена, контакты стёрты, бронь отменена'
        : 'Заявка удалена, контакты стёрты',
  });
}
