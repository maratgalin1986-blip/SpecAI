import type { Metadata } from 'next';
import { ORDER_STATUS_LABELS } from '@specai/shared';
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
import { isEmailConfigured } from '@/lib/email';
import { HOUSE_COMPANY_ID, PUBLISHED_FLEET, isProvider } from '@/lib/fleet';
import { providerForCustomer } from '@/lib/customerPrivacy';
import { redirect } from 'next/navigation';
import { GuideCard } from '@/components/GuideCard';
import { CommentForm } from '@/components/Comments';
import { guideFor } from '@/lib/guideState';
import { CabinetQuickOrder } from '@/components/CabinetQuickOrder';
import { ReferralCard } from '@/components/ReferralCard';
import { orderTimeline } from '@/lib/orderTimeline';
import { ensureReferralCode, invitedCounts } from '@/lib/referralStore';
import { referralLink } from '@/lib/referral';
import { siteUrl } from '@/lib/siteUrl';

export const metadata: Metadata = { title: 'Личный кабинет', robots: { index: false } };

export const dynamic = 'force-dynamic';

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
  // The fleet manager's cabinet is /provider (the header's «Кабинет» leads here).
  if (isProvider(session?.user)) redirect('/provider');
  const paymentNotice = searchParams?.payment ? PAYMENT_NOTICE[searchParams.payment] : undefined;
  const paymentsEnabled = isOnlinePaymentEnabled();

  const [
    guide,
    equipmentCount,
    activeBookings,
    myBookings,
    myOrders,
    me,
    categories,
    referralCode,
    invited,
  ] = await Promise.all([
    guideFor(session?.user),
    prisma.equipment.count({ where: PUBLISHED_FLEET }),
    session
      ? prisma.booking.count({
          where: { customerId: session.user.id, status: { in: ['CONFIRMED', 'ACTIVE'] } },
        })
      : Promise.resolve(0),
    session
      ? prisma.booking.findMany({
          where: { customerId: session.user.id },
          include: {
            equipment: { include: { company: { select: { id: true, name: true, phone: true } } } },
            review: true,
            payment: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
    session
      ? prisma.order.findMany({
          where: { customerId: session.user.id },
          include: { bids: { select: { id: true } }, booking: { select: { status: true } } },
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
    // Quick-order tiles: the machine types with the most published machinery first.
    prisma.equipmentCategory
      .findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { equipment: { where: PUBLISHED_FLEET } } },
        },
      })
      .then((rows) =>
        rows
          .sort((a, b) => b._count.equipment - a._count.equipment || a.name.localeCompare(b.name))
          .map(({ id, name }) => ({ id, name })),
      ),
    session ? ensureReferralCode(session.user.id).catch(() => null) : Promise.resolve(null),
    session
      ? invitedCounts(session.user.id).catch(() => ({ total: 0, providers: 0 }))
      : Promise.resolve({ total: 0, providers: 0 }),
  ]);

  const stats = [
    { label: 'Техники в каталоге', value: equipmentCount },
    { label: 'Активных бронирований', value: activeBookings },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-graphite-950">Личный кабинет</h1>
        <a href="#invite" className="text-sm font-semibold text-signal-700 hover:underline">
          Пригласить коллегу
        </a>
      </div>
      <CabinetQuickOrder categories={categories} />
      <GuideCard guide={guide} />
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
      {session && me && !me.emailVerified && (
        <VerifyEmailBanner emailEnabled={isEmailConfigured()} />
      )}
      {paymentNotice && (
        <p className={`rounded-md border px-4 py-3 text-sm ${paymentNotice.className}`}>
          {paymentNotice.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="cab-card">
            <p className="text-xs text-graphite-500 sm:text-sm">{stat.label}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-graphite-950">{stat.value}</p>
          </div>
        ))}
      </div>

      <div id="orders" className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold">Мои заявки</h2>
        {myOrders.length === 0 ? (
          <p className="text-sm text-slate-600">
            Заявок пока нет — выберите технику в «Быстром заказе» выше или{' '}
            <a href="/orders#new" className="font-medium text-signal-700">
              опишите задачу
            </a>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {myOrders.map((order) => {
              const timeline = orderTimeline({
                orderStatus: order.status,
                bidCount: order.bids.length,
                bookingStatus: order.booking?.status ?? null,
              });
              const current =
                timeline.steps.find((step) => step.state === 'current') ??
                timeline.steps.filter((step) => step.state === 'done').pop();
              return (
                <a key={order.id} href={`/orders/${order.id}`} className="group">
                  <div className="cab-card flex flex-col gap-3 transition group-hover:border-signal-400">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-semibold text-graphite-950">
                        {order.description}
                      </p>
                      <span className="w-fit shrink-0 rounded-full bg-graphite-100 px-2.5 py-0.5 text-xs font-semibold text-graphite-700">
                        {timeline.cancelled
                          ? ORDER_STATUS_LABELS[order.status]
                          : (current?.title ?? ORDER_STATUS_LABELS[order.status])}
                      </span>
                    </div>
                    <div className="flex gap-1" aria-hidden>
                      {timeline.steps.map((step) => (
                        <span
                          key={step.id}
                          className={`h-1.5 flex-1 rounded-full ${
                            timeline.cancelled
                              ? 'bg-graphite-200'
                              : step.state === 'done'
                                ? 'bg-signal-500'
                                : step.state === 'current'
                                  ? 'bg-signal-200'
                                  : 'bg-graphite-100'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-graphite-600">
                      {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                      {order.desiredEndDate.toLocaleDateString('ru-RU')} · Предложений:{' '}
                      {order.bids.length}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div id="bookings" className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold">Мои бронирования</h2>
        {!paymentsEnabled && myBookings.length > 0 && (
          <p className="mb-3 text-sm text-slate-600">
            Бронирование бесплатное: без предоплаты и комиссий. Работа техники — по цене
            исполнителя, расчёт с исполнителем напрямую после смены. Вопросы по сервису:{' '}
            <a href={SITE.phoneHref} className="font-medium text-amber-700">
              {SITE.phone}
            </a>
          </p>
        )}
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-600">Бронирований пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myBookings.map((booking) => {
              const provider = providerForCustomer(
                booking.equipment.company,
                booking.status,
                HOUSE_COMPANY_ID,
                SITE.phone,
              );
              return (
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
                    <p className="text-sm text-slate-600">
                      Исполнитель: {provider.name}
                      {provider.phone ? (
                        <>
                          {' · '}
                          <a
                            href={`tel:${provider.phone.replace(/[^\d+]/g, '')}`}
                            className="font-semibold text-amber-700"
                          >
                            {provider.phone}
                          </a>
                        </>
                      ) : (
                        booking.status === 'PENDING' && (
                          <span className="text-xs text-slate-500">
                            {' '}
                            · телефон появится после подтверждения
                          </span>
                        )
                      )}
                    </p>
                    {!paymentsEnabled && booking.status !== 'CANCELLED' && (
                      <p className="text-xs text-slate-500">
                        Расчёт с исполнителем «{provider.name}» после смены.
                      </p>
                    )}
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
                    {['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(booking.status) && (
                      <div className="mt-2">
                        <CommentForm
                          compact
                          targetCompanyId={booking.equipment.companyId}
                          label="Комментарий об исполнителе"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <BookingStatusBadge status={booking.status} />
                    {paymentsEnabled &&
                      (booking.status === 'PENDING' || booking.status === 'CONFIRMED') &&
                      !booking.depositPaid &&
                      booking.payment?.status !== 'PAID' &&
                      !booking.payment?.refundRequired && (
                        <PayBookingButton bookingId={booking.id} />
                      )}
                    {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                      <BookingActionButtons
                        bookingId={booking.id}
                        availableTransitions={['CANCELLED']}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {referralCode && (
        <ReferralCard
          link={referralLink(siteUrl(), referralCode)}
          role="CUSTOMER"
          invited={invited}
        />
      )}
    </div>
  );
}
