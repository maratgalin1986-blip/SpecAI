import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { ReviewForm } from '@/components/ReviewForm';

export const dynamic = 'force-dynamic';

const ORDER_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Открыта',
  MATCHED: 'Закрыта — техника выбрана',
  CANCELLED: 'Отменена',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [equipmentCount, activeBookings, companies, myBookings, myOrders] = await Promise.all([
    prisma.equipment.count(),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    prisma.company.count({ where: { isProvider: true } }),
    session
      ? prisma.booking.findMany({
          where: { customerId: session.user.id },
          include: { equipment: true, review: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
    session
      ? prisma.order.findMany({
          where: { customerId: session.user.id },
          include: { bids: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const stats = [
    { label: 'Техники размещено', value: equipmentCount },
    { label: 'Активных бронирований', value: activeBookings },
    { label: 'Компаний-поставщиков', value: companies },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Личный кабинет</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Мои заявки</h2>
        {myOrders.length === 0 ? (
          <p className="text-sm text-slate-600">
            Заявок пока нет.{' '}
            <a href="/orders" className="font-medium text-amber-700">
              Опубликовать
            </a>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {myOrders.map((order) => (
              <a key={order.id} href={`/orders/${order.id}`}>
                <Card className="flex items-center justify-between gap-4 hover:border-amber-400">
                  <div>
                    <p className="font-medium">{order.description}</p>
                    <p className="text-sm text-slate-500">
                      {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                      {order.desiredEndDate.toLocaleDateString('ru-RU')} · Предложений:{' '}
                      {order.bids.length}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                </Card>
              </a>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Мои бронирования</h2>
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-600">Бронирований пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myBookings.map((booking) => (
              <Card key={booking.id} className="flex items-center justify-between gap-4">
                <div>
                  <a
                    href={`/equipment/${booking.equipmentId}`}
                    className="font-medium hover:text-amber-700"
                  >
                    {booking.equipment.name}
                  </a>
                  <p className="text-sm text-slate-500">
                    {booking.startDate.toLocaleDateString('ru-RU')} –{' '}
                    {booking.endDate.toLocaleDateString('ru-RU')} · ${booking.totalPrice.toString()}{' '}
                    {booking.currency}
                  </p>
                  {booking.status === 'COMPLETED' && !booking.review && (
                    <div className="mt-2">
                      <ReviewForm bookingId={booking.id} />
                    </div>
                  )}
                </div>
                <BookingStatusBadge status={booking.status} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
