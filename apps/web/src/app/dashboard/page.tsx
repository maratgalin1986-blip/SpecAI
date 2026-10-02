import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { ReviewForm } from '@/components/ReviewForm';
import { formatMoney } from '@/lib/money';
import { PayBookingButton } from '@/components/PayBookingButton';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { isOnlinePaymentEnabled } from '@/lib/stripe';
import { SITE } from '@/lib/site';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
import { OWN_FLEET } from '@/lib/fleet';

export const metadata: Metadata = { title: 'Личный кабинет', robots: { index: false } };

export const dynamic = 'force-dynamic';

const ORDER_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Открыта',
  MATCHED: 'Закрыта — техника выбрана',
  CANCELLED: 'Отменена',
};

const PAYMENT_NOTICE: Record<string, { text: string; className: string }> = {
  success: {
    text: 'Оплата прошла успешно. Статус бронирования обновится в течение нескольких секунд после подтверждения от Stripe.',
    className: 'border-green-200 bg-green-50 text-green-800',
  },
  cancelled: {
    text: 'Оплата отменена. Вы можете вернуться к ней позже.',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

function PaymentStatusLabel({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
      Оплачено
    </span>
  ) : (
    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
      Ожидает оплаты
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { payment?: string; verified?: string };
}) {
  const session = await getServerSession(authOptions);
  const paymentNotice = searchParams?.payment ? PAYMENT_NOTICE[searchParams.payment] : undefined;
  const paymentsEnabled = isOnlinePaymentEnabled();

  const [equipmentCount, activeBookings, myBookings, myOrders, me] = await Promise.all([
    prisma.equipment.count({ where: { ...OWN_FLEET, status: { not: 'RETIRED' } } }),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    session
      ? prisma.booking.findMany({
          where: { customerId: session.user.id },
          include: { equipment: true, review: true, payment: true },
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
    session
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { emailVerified: true },
        })
      : Promise.resolve(null),
  ]);

  const stats = [
    { label: 'Машин в парке СпецПласт16', value: equipmentCount },
    { label: 'Активных бронирований', value: activeBookings },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Личный кабинет</h1>
      {searchParams?.verified === '1' && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Email подтверждён. Спасибо!
        </p>
      )}
      {searchParams?.verified === '0' && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Ссылка подтверждения недействительна или устарела. Запросите новое письмо.
        </p>
      )}
      {session && me && !me.emailVerified && <VerifyEmailBanner />}
      {paymentNotice && (
        <p className={`rounded-md border px-4 py-3 text-sm ${paymentNotice.className}`}>
          {paymentNotice.text}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
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
                <Card className="flex flex-col gap-3 hover:border-amber-400 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{order.description}</p>
                    <p className="text-sm text-slate-500">
                      {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                      {order.desiredEndDate.toLocaleDateString('ru-RU')} · Предложений:{' '}
                      {order.bids.length}
                    </p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
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
        {!paymentsEnabled && myBookings.length > 0 && (
          <p className="mb-3 text-sm text-slate-600">
            Оплата — по счёту после подтверждения брони, менеджер свяжется с вами. Вопросы:{' '}
            <a href={SITE.phoneHref} className="font-medium text-amber-700">
              {SITE.phone}
            </a>
          </p>
        )}
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-600">Бронирований пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myBookings.map((booking) => (
              <Card
                key={booking.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <a
                    href={`/equipment/${booking.equipmentId}`}
                    className="font-medium hover:text-amber-700"
                  >
                    {booking.equipment.name}
                  </a>
                  <p className="text-sm text-slate-500">
                    {booking.startDate.toLocaleDateString('ru-RU')} –{' '}
                    {booking.endDate.toLocaleDateString('ru-RU')} ·{' '}
                    {formatMoney(booking.totalPrice, booking.currency)}
                  </p>
                  {booking.payment?.refundRequired ? (
                    <div className="mt-2">
                      <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        Требуется возврат
                      </span>
                    </div>
                  ) : (
                    booking.status !== 'CANCELLED' &&
                    (paymentsEnabled ||
                      booking.depositPaid ||
                      booking.payment?.status === 'PAID') && (
                      <div className="mt-2">
                        <PaymentStatusLabel
                          paid={booking.depositPaid || booking.payment?.status === 'PAID'}
                        />
                      </div>
                    )
                  )}
                  {booking.status === 'COMPLETED' && !booking.review && (
                    <div className="mt-2">
                      <ReviewForm bookingId={booking.id} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <BookingStatusBadge status={booking.status} />
                  {paymentsEnabled &&
                    (booking.status === 'PENDING' || booking.status === 'CONFIRMED') &&
                    !booking.depositPaid &&
                    booking.payment?.status !== 'PAID' &&
                    !booking.payment?.refundRequired && <PayBookingButton bookingId={booking.id} />}
                  {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                    <BookingActionButtons
                      bookingId={booking.id}
                      availableTransitions={['CANCELLED']}
                    />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
