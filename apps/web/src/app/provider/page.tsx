import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { formatMoney } from '@/lib/money';
import { ProviderEquipmentCard } from '@/components/ProviderEquipmentCard';
import { CONTACTS_AFTER_CONFIRM, customerForProvider } from '@/lib/customerPrivacy';
import { SITE } from '@/lib/site';
import { Pagination } from '@/components/Pagination';
import { parsePage, totalPagesFor } from '@/lib/pagination';
import { isHouseManager, isProvider } from '@/lib/fleet';
import { GuideCard } from '@/components/GuideCard';
import { PhotoShare } from '@/components/PhotoShare';
import { CommentForm, CommentList } from '@/components/Comments';
import { guideFor } from '@/lib/guideState';
import { toPublicComment } from '@/lib/comments';
import { MyMapPin } from '@/components/MyMapPin';
import { getBlobToken } from '@/lib/blob';
import { isDisplayableImage, pinPhotoChoices } from '@/lib/providerMap';
import { OnlineToggle } from '@/components/OnlineToggle';
import { MachineStatusChips } from '@/components/MachineStatusChips';
import { NoOrdersChecklist } from '@/components/NoOrdersChecklist';
import { ReliabilityBadges } from '@/components/ReliabilityBadges';
import { CompanyProfileForm } from '@/components/CompanyProfileForm';
import { ReferralCard } from '@/components/ReferralCard';
import { companyReliability } from '@/lib/companyStats';
import {
  INCOME_STATUSES,
  monthIncome,
  monthStartMsk,
  noOrdersChecklist,
} from '@/lib/providerDashboard';
import { ensureReferralCode, invitedCounts } from '@/lib/referralStore';
import { referralLink } from '@/lib/referral';
import { siteUrl } from '@/lib/siteUrl';
import { providerPath } from '@/lib/providerSeo';
import { customerShortName } from '@/lib/customerPrivacy';
import { pluralizeRu } from '@/lib/pluralize';
import { NotificationSettings } from '@/components/NotificationSettings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Кабинет парка',
  description: `Парк техники ${SITE.name}: бронирования и заявки клиентов.`,
  robots: { index: false },
};

const PAGE_SIZE = 20;

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

interface ProviderSearchParams {
  page?: string;
  bookingsPage?: string;
}

export default async function ProviderPage({
  searchParams,
}: {
  searchParams: ProviderSearchParams;
}) {
  const session = await getServerSession(authOptions);

  // Aggregator: every provider (and СпецПласт16's own fleet) manages its
  // machinery, bookings and map pin here; only its own company's data.
  if (!session) redirect('/login?callbackUrl=/provider');
  if (!isProvider(session.user) || !session.user.companyId) redirect('/dashboard');

  const equipmentWhere = { companyId: session.user.companyId };
  const bookingsWhere = { equipment: { companyId: session.user.companyId } };

  const [equipmentTotal, bookingsTotal] = await Promise.all([
    prisma.equipment.count({ where: equipmentWhere }),
    prisma.booking.count({ where: bookingsWhere }),
  ]);

  const equipmentTotalPages = totalPagesFor(equipmentTotal, PAGE_SIZE);
  const equipmentPage = Math.min(parsePage(searchParams.page), equipmentTotalPages);
  const bookingsTotalPages = totalPagesFor(bookingsTotal, PAGE_SIZE);
  const bookingsPage = Math.min(parsePage(searchParams.bookingsPage), bookingsTotalPages);

  const [equipment, bookings, pinCompany, photoRows] = await Promise.all([
    prisma.equipment.findMany({
      where: equipmentWhere,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: (equipmentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.findMany({
      where: bookingsWhere,
      include: {
        equipment: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (bookingsPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: {
        baseLat: true,
        baseLon: true,
        baseAddress: true,
        pinImageUrl: true,
        pinNote: true,
      },
    }),
    prisma.equipment.findMany({
      where: equipmentWhere,
      select: { imageUrls: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  // Pro-like dashboard: summary, incoming orders, machine statuses, checklist.
  const companyId = session.user.companyId;
  const monthStart = monthStartMsk();
  const feedWhere = {
    status: 'OPEN' as const,
    NOT: { customer: { companyId } },
    bids: { none: { equipment: { companyId } } },
  };
  const [
    profile,
    fleet,
    monthBookings,
    activeBookings,
    feed,
    feedTotal,
    trust,
    referralCode,
    invited,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { description: true, phone: true, verified: true },
    }),
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: { id: true, name: true, status: true, imageUrls: true, hourlyRate: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.booking.findMany({
      where: {
        equipment: { companyId },
        status: { in: [...INCOME_STATUSES] },
        startDate: { gte: monthStart },
      },
      select: { status: true, startDate: true, totalPrice: true },
      take: 1000,
    }),
    prisma.booking.count({
      where: { equipment: { companyId }, status: { in: ['CONFIRMED', 'ACTIVE'] } },
    }),
    prisma.order.findMany({
      where: feedWhere,
      include: {
        category: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.order.count({ where: feedWhere }),
    companyReliability(companyId),
    ensureReferralCode(session.user.id).catch(() => null),
    invitedCounts(session.user.id).catch(() => ({ total: 0, providers: 0 })),
  ]);
  const income = monthIncome(monthBookings);
  const checklist = noOrdersChecklist({
    hasPhone: Boolean(profile?.phone?.trim()),
    hasDescription: Boolean(profile?.description?.trim()),
    machines: fleet.length,
    machinesWithPhoto: fleet.filter((item) => item.imageUrls.some(isDisplayableImage)).length,
    machinesWithHourly: fleet.filter((item) => item.hourlyRate !== null).length,
    machinesAvailable: fleet.filter((item) => item.status === 'AVAILABLE').length,
    hasBase: pinCompany?.baseLat != null && pinCompany?.baseLon != null,
    verified: Boolean(profile?.verified),
    newOrders: feedTotal,
  });

  const ownPhotos = pinPhotoChoices(
    session.user.companyId,
    photoRows.flatMap((row) => row.imageUrls),
  );

  // Approved comments about these customers from any provider, and the assistant.
  const customerIds = [...new Set(bookings.map((booking) => booking.customerId))];
  const [guide, customerComments] = await Promise.all([
    guideFor(session.user),
    customerIds.length > 0
      ? prisma.comment.findMany({
          where: { status: 'APPROVED', targetUserId: { in: customerIds } },
          include: {
            author: { select: { name: true, role: true, company: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : Promise.resolve([]),
  ]);
  const commentsAbout = (customerId: string) =>
    customerComments
      .filter((comment) => comment.targetUserId === customerId)
      .slice(0, 3)
      .map(toPublicComment);

  // The two lists are paginated independently: `page` drives equipment,
  // `bookingsPage` drives bookings, and each keeps the other's value.
  const currentQuery = {
    page: equipmentPage > 1 ? String(equipmentPage) : undefined,
    bookingsPage: bookingsPage > 1 ? String(bookingsPage) : undefined,
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="cab-eyebrow">Кабинет исполнителя</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-graphite-950">
            {isHouseManager(session.user) ? 'Кабинет парка СпецПласт16' : 'Кабинет поставщика'}
          </h1>
          <a
            href={providerPath(companyId)}
            className="text-sm font-semibold text-signal-700 hover:underline"
          >
            Моя публичная страница
          </a>
        </div>
        <OnlineToggle />
      </div>

      <section aria-label="Сводка" className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="cab-dark">
            <p className="text-xs text-graphite-300">Доход за месяц</p>
            <p className="mt-1 break-words font-mono text-2xl font-bold text-signal-300">
              {formatMoney(income)}
            </p>
            <p className="mt-1 text-[0.7rem] text-graphite-300">
              подтверждённые брони с началом в этом месяце
            </p>
          </div>
          <a href="#bookings" className="cab-card hover:border-signal-400">
            <p className="text-xs text-graphite-500">Активные брони</p>
            <p className="mt-1 font-mono text-2xl font-bold text-graphite-950">{activeBookings}</p>
          </a>
          <a href="#feed" className="cab-card hover:border-signal-400">
            <p className="text-xs text-graphite-500">Новые заявки</p>
            <p className="mt-1 font-mono text-2xl font-bold text-graphite-950">{feedTotal}</p>
          </a>
          <div className="cab-card">
            <p className="text-xs text-graphite-500">Рейтинг</p>
            <p className="mt-1 font-mono text-2xl font-bold text-graphite-950">
              {trust.rating !== null ? `★ ${trust.rating.toFixed(1)}` : '—'}
            </p>
            <p className="mt-1 text-[0.7rem] text-graphite-500">
              {trust.ratingCount > 0
                ? pluralizeRu(trust.ratingCount, ['отзыв', 'отзыва', 'отзывов'])
                : 'отзывов пока нет'}
            </p>
          </div>
        </div>
        <ReliabilityBadges value={trust} />
      </section>

      <section id="feed" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-graphite-950">Входящие заявки</h2>
          <a href="/orders" className="text-sm font-semibold text-signal-700 hover:underline">
            Вся лента
          </a>
        </div>
        {feed.length === 0 ? (
          <p className="cab-card text-sm text-graphite-600">
            Новых заявок без вашей цены нет. Оставайтесь на линии — лента обновляется сама.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {feed.map((order) => (
              <li key={order.id} className="cab-card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-graphite-950">
                    {order.category?.name ?? 'Любая техника'}
                  </p>
                  <span className="shrink-0 rounded-full bg-graphite-100 px-2 py-0.5 text-[0.7rem] font-semibold text-graphite-700">
                    {order._count.bids > 0 ? `Предложений: ${order._count.bids}` : 'Без ответа'}
                  </span>
                </div>
                <p className="line-clamp-3 break-words text-sm text-graphite-700">
                  {order.description}
                </p>
                <p className="text-xs text-graphite-500">
                  {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                  {order.desiredEndDate.toLocaleDateString('ru-RU')} ·{' '}
                  {order.source === 'SITE'
                    ? customerShortName(order.customer.name)
                    : `из ${order.source === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}`}
                </p>
                <a href={`/orders/${order.id}#bid`} className="cab-action mt-auto w-full">
                  Предложить цену
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="fleet-status" className="cab-card flex scroll-mt-24 flex-col gap-2">
        <div>
          <h2 className="text-lg font-bold text-graphite-950">Техника на линии</h2>
          <p className="text-sm text-graphite-600">
            Отмечайте, какая машина свободна: предложить по заявке можно только свободную технику.
          </p>
        </div>
        <MachineStatusChips
          machines={fleet.map((item) => ({ id: item.id, name: item.name, status: item.status }))}
        />
      </section>

      <NoOrdersChecklist items={checklist} />

      <GuideCard guide={guide} />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <PhotoShare role="executor" />
      </section>

      {pinCompany && (
        <section id="base" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Моя точка на карте</h2>
            <p className="text-sm text-slate-600">
              {pinCompany.baseLat === null
                ? 'Вас пока нет на карте исполнителей — укажите, где стоит техника.'
                : 'Так заказчики находят ближайшего исполнителя на карте.'}
            </p>
          </div>
          <Card className="max-w-xl">
            <MyMapPin
              company={pinCompany}
              photos={ownPhotos}
              uploadsEnabled={Boolean(getBlobToken())}
            />
          </Card>
        </section>
      )}

      <section id="fleet" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Ваша техника</h2>
          <p className="text-sm text-slate-600">
            Всего: {equipmentTotal}
            {equipmentTotalPages > 1 && ` · страница ${equipmentPage} из ${equipmentTotalPages}`}
          </p>
        </div>
        {equipment.length === 0 ? (
          <p className="text-sm text-slate-600">
            Техника пока не добавлена — заполните форму ниже, чтобы опубликовать первую позицию.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => (
              <ProviderEquipmentCard
                key={item.id}
                categoryName={item.category.name}
                item={{
                  id: item.id,
                  name: item.name,
                  categoryId: item.categoryId,
                  make: item.make,
                  model: item.model,
                  year: item.year,
                  status: item.status,
                  dailyRate: item.dailyRate.toString(),
                  hourlyRate: item.hourlyRate?.toString() ?? null,
                  description: item.description,
                  specs: item.specs,
                  imageUrls: item.imageUrls,
                }}
              />
            ))}
          </div>
        )}
        <Pagination
          page={equipmentPage}
          totalPages={equipmentTotalPages}
          basePath="/provider"
          searchParams={{ bookingsPage: currentQuery.bookingsPage }}
        />
      </section>

      <section id="add-equipment" className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold">Добавить технику</h2>
        <Card className="max-w-xl">
          <NewEquipmentForm />
        </Card>
      </section>

      <section id="bookings" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Бронирования</h2>
          <p className="text-sm text-slate-600">
            Всего: {bookingsTotal}
            {bookingsTotalPages > 1 && ` · страница ${bookingsPage} из ${bookingsTotalPages}`}
          </p>
        </div>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">
            Бронирований пока нет — они появятся, когда клиенты забронируют вашу технику.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => {
              const customer = customerForProvider(booking.customer, booking.status);
              return (
                <Card
                  key={booking.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{booking.equipment.name}</p>
                    <p className="text-sm text-slate-500">
                      Заказчик: {customer.name} · {booking.startDate.toLocaleDateString('ru-RU')} –{' '}
                      {booking.endDate.toLocaleDateString('ru-RU')} ·{' '}
                      {formatMoney(booking.totalPrice, booking.currency)}
                    </p>
                    {customer.contactsVisible ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                        {customer.phone && (
                          <a
                            href={`tel:${customer.phone}`}
                            className="font-semibold text-amber-700"
                          >
                            {customer.phone}
                          </a>
                        )}
                        {customer.email && (
                          <a href={`mailto:${customer.email}`} className="text-amber-700 underline">
                            {customer.email}
                          </a>
                        )}
                      </p>
                    ) : (
                      booking.status === 'PENDING' && (
                        <p className="mt-1 text-xs text-slate-500">{CONTACTS_AFTER_CONFIRM}.</p>
                      )
                    )}
                    {commentsAbout(booking.customerId).length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-semibold text-slate-600">
                          Комментарии исполнителей о заказчике
                        </p>
                        <CommentList comments={commentsAbout(booking.customerId)} />
                      </div>
                    )}
                    {booking.status !== 'CANCELLED' && (
                      <div className="mt-2">
                        <CommentForm
                          compact
                          targetUserId={booking.customerId}
                          label="Комментарий о заказчике"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <BookingStatusBadge status={booking.status} />
                    <BookingActionButtons
                      bookingId={booking.id}
                      availableTransitions={PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? []}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <Pagination
          page={bookingsPage}
          totalPages={bookingsTotalPages}
          basePath="/provider"
          pageParam="bookingsPage"
          searchParams={{ page: currentQuery.page }}
        />
      </section>

      <section id="profile" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Профиль компании</h2>
          <p className="text-sm text-graphite-600">
            Пара строк о компании на{' '}
            <a href={providerPath(companyId)} className="text-signal-700 underline">
              публичной странице
            </a>{' '}
            и телефон, который заказчик увидит после подтверждения брони.
          </p>
        </div>
        <div className="cab-card max-w-xl">
          <CompanyProfileForm
            initial={{ description: profile?.description ?? null, phone: profile?.phone ?? null }}
          />
        </div>
      </section>

      {referralCode && (
        <ReferralCard
          link={referralLink(siteUrl(), referralCode)}
          role="PROVIDER"
          invited={invited}
        />
      )}
      {session && <NotificationSettings />}
    </div>
  );
}
