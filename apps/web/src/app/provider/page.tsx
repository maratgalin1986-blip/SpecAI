import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { SupportPrompt } from '@/components/SupportCard';
import { completedBookingIds } from '@/lib/supportPrompt';
import { formatMoney } from '@/lib/money';
import { ProviderEquipmentCard } from '@/components/ProviderEquipmentCard';
import { CONTACTS_AFTER_CONFIRM, customerForProvider } from '@/lib/customerPrivacy';
import { Pagination } from '@/components/Pagination';
import { parsePage, totalPagesFor } from '@/lib/pagination';
import { isHouseManager, isProvider } from '@/lib/fleet';
import { GuideCard } from '@/components/GuideCard';
import { PhotoShare } from '@/components/PhotoShare';
import { CommentForm, CommentList } from '@/components/Comments';
import { guideFor } from '@/lib/guideState';
import { loadIncomingOrders } from '@/lib/providerFeedData';
import { maskContactsAndLinks } from '@/lib/privacy';
import { toPublicComment } from '@/lib/comments';
import { MyMapPin } from '@/components/MyMapPin';
import { isDisplayableImage, pinPhotoChoices } from '@/lib/providerMap';
import { OnlineToggle } from '@/components/OnlineToggle';
import { LineStandingCard } from '@/components/LineStandingCard';
import { isLive } from '@/lib/linePresence';
import {
  addDays,
  localDayKey,
  STANDING_MAX_DAYS,
  standingActive,
  untilLong,
} from '@/lib/lineStanding';
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
import { priorityBadgeText } from '@/lib/referralPriority';
import { siteUrl } from '@/lib/siteUrl';
import { providerPath } from '@/lib/providerSeo';
import { customerShortName } from '@/lib/customerPrivacy';
import { pluralizeRu } from '@/lib/pluralize';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ProviderDocuments } from '@/components/ProviderDocuments';
import { DeliverySettingsForm } from '@/components/DeliverySettingsForm';
import { documentStatus } from '@/lib/documents';
import { ProviderOpsSection, loadOperatorOptions } from '@/components/shifts/ProviderOpsSection';
import { OperatorSelect } from '@/components/shifts/OperatorSelect';
import { ShiftPanel } from '@/components/shifts/ShiftPanel';
import { ModeSwitch } from '@/components/ModeSwitch';
import { Hint } from '@/components/Hint';
import { CUSTOMER_MODE_HREF } from '@/lib/cabinetMode';
import { AKTUALNO_PATH, isAvailabilityFresh } from '@/lib/aktualno';
import { CabinetLayout, ManagerCard } from '@/components/CabinetNav';
import { VerificationPanel } from '@/components/VerificationPanel';
import { SaveLoginForm } from '@/components/SaveLoginForm';
import { SITE } from '@/lib/site';
import { isQuickPlaceholderEmail } from '@/lib/quickProvider';
import {
  FIRST_ORDER_STATUSES,
  VERIFICATION_STATUS_TEXT,
  shouldOfferFullRegistration,
  taxRegimeLabel,
  verificationStatus,
} from '@/lib/providerVerification';

/** «Цены и свободные дни»: the quick page of the weekly question, any time. */
function AktualnoCard({ fresh, total }: { fresh: number; total: number }) {
  return (
    <section id="aktualno" className="cab-card flex scroll-mt-24 flex-col gap-2">
      <h2 className="text-lg font-bold text-graphite-950">Цены и свободные дни</h2>
      <p className="text-sm text-graphite-600">
        {fresh === total
          ? 'Всё актуально: заказчики видят «Свободна…» на ваших машинах.'
          : `Обновлено ${fresh} из ${total}. Машины с актуальными ценами и свободными днями заказчики видят выше в каталоге.`}
      </p>
      <a href={AKTUALNO_PATH} className="cab-action w-full sm:w-fit">
        Обновить за 30 секунд
      </a>
    </section>
  );
}

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Кабинет исполнителя',
  description: 'Кабинет исполнителя: техника, заявки, предложения и брони.',
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
  /** Just became a provider under the same login (BecomeProviderForm). */
  welcome?: string;
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
  const [
    profile,
    fleet,
    monthBookings,
    activeBookings,
    incoming,
    trust,
    referralCode,
    invited,
    bonus,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        description: true,
        phone: true,
        verified: true,
        provisional: true,
        verificationRequestedAt: true,
        verificationRejectedReason: true,
        taxRegime: true,
        deliveryRadiusKm: true,
        deliveryPricePerKm: true,
      },
    }),
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: {
        id: true,
        name: true,
        status: true,
        imageUrls: true,
        hourlyRate: true,
        availabilityUpdatedAt: true,
      },
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
    loadIncomingOrders(companyId),
    companyReliability(companyId),
    ensureReferralCode(session.user.id).catch(() => null),
    invitedCounts(session.user.id).catch(() => ({ total: 0, providers: 0 })),
    // «Пригласи друга»: until when new orders come 5 minutes earlier.
    prisma.user
      .findUnique({ where: { id: session.user.id }, select: { priorityUntil: true } })
      .catch(() => null),
  ]);
  // Полная регистрация после первого заказа, свои предложения и вход по e-mail.
  const [confirmedOrders, myBids, me] = await Promise.all([
    prisma.booking.count({
      where: { equipment: { companyId }, status: { in: [...FIRST_ORDER_STATUSES] } },
    }),
    prisma.bid.findMany({
      where: { equipment: { companyId } },
      select: {
        id: true,
        price: true,
        currency: true,
        status: true,
        createdAt: true,
        equipment: { select: { name: true } },
        order: { select: { id: true, description: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, phone: true, phoneVerifiedAt: true },
    }),
  ]);
  const verification = profile ? verificationStatus(profile) : ('unverified' as const);
  const offerFullRegistration = profile
    ? shouldOfferFullRegistration(profile, confirmedOrders)
    : false;
  const quickAccount = isQuickPlaceholderEmail(me?.email);
  const BID_STATUS: Record<string, string> = {
    PENDING: 'Ждёт ответа',
    ACCEPTED: 'Принято',
    REJECTED: 'Не выбрано',
  };
  const navItems = [
    { href: '#feed', label: 'Заявки', badge: incoming.total },
    { href: '#bids', label: 'Мои предложения', badge: myBids.length },
    { href: '#bookings', label: 'Брони', badge: activeBookings },
    { href: '#fleet', label: 'Мои машины', badge: fleet.length },
    { href: '#line', label: 'Линия' },
    { href: '#income', label: 'Доход' },
    {
      href: '#verification',
      label: 'Документы и проверка',
      badge: offerFullRegistration ? '!' : null,
    },
    { href: '#documents', label: 'Документы машин' },
    { href: '#notifications', label: 'Уведомления' },
    { href: '#profile', label: 'Профиль' },
    { href: '#manager', label: 'Связь' },
  ];
  const priorityBadge = priorityBadgeText(bonus?.priorityUntil, new Date());
  // «На линии на 5 рабочих дней» (lib/lineStanding.ts): this user's own line.
  const [linePresence, lineMachines] = await Promise.all([
    prisma.linePresence.findUnique({ where: { userId: session.user.id } }).catch(() => null),
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ]);
  const lineNow = new Date();
  const lineOn = linePresence
    ? standingActive(linePresence, lineNow) || isLive(linePresence, lineNow)
    : false;
  const lineState = {
    on: lineOn,
    equipmentId: linePresence?.equipmentId ?? null,
    forever: Boolean(lineOn && linePresence?.standingForever),
    untilText:
      lineOn && linePresence?.standingUntil
        ? untilLong(linePresence.standingUntil, linePresence.timeZone)
        : null,
    live: linePresence ? isLive(linePresence, lineNow) : false,
  };
  const lineToday = localDayKey(lineNow, linePresence?.timeZone);
  const { items: feed, total: feedTotal } = incoming;
  const income = monthIncome(monthBookings);
  // Documents (СТС, ПСМ, страховка…): expired ones mark the machine and the checklist.
  const documents = await prisma.providerDocument.findMany({
    where: { companyId },
    select: { equipmentId: true, expiresAt: true },
    take: 500,
  });
  const expiredDocs = documents.filter((doc) => documentStatus(doc) === 'expired');
  const expiredFor = (equipmentId: string) =>
    expiredDocs.filter((doc) => doc.equipmentId === equipmentId).length;
  // Operators («машинисты») for the booking cards: assign one per booking.
  const operatorOptions = await loadOperatorOptions(companyId);
  const checklist = noOrdersChecklist({
    expiredDocuments: expiredDocs.length,
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
    <CabinetLayout title="Кабинет исполнителя" items={navItems}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="cab-eyebrow">Кабинет исполнителя</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-graphite-950">
              {isHouseManager(session.user)
                ? 'Кабинет парка СпецПласт16'
                : 'Техника, заявки и брони'}
            </h1>
            <div className="flex flex-wrap gap-x-4">
              <a
                href={providerPath(companyId)}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-signal-700 hover:underline"
              >
                Моя публичная страница
              </a>
              <a
                href={CUSTOMER_MODE_HREF}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-signal-700 hover:underline"
              >
                Я заказываю технику →
              </a>
            </div>
            {priorityBadge && (
              <a
                href="#invite"
                className="mt-1 inline-flex w-fit rounded-full bg-signal-50 px-3 py-1 text-sm font-semibold text-signal-800"
              >
                {priorityBadge}
              </a>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <ModeSwitch current="provider" />
            <OnlineToggle />
          </div>
        </div>

        {searchParams.welcome === 'quick' && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          >
            Готово: машина на линии на 5 рабочих дней, заказчики видят её на карте с пометкой «Новый
            исполнитель, данные не проверены». Укажите цену за час в карточке машины ниже — так
            заявок будет больше.
          </p>
        )}
        {offerFullRegistration && (
          <a
            href="#verification"
            className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-500"
          >
            <strong className="text-base">Завершите регистрацию</strong>
            <span>
              {verification === 'rejected'
                ? 'Проверка не пройдена — исправьте данные и отправьте снова.'
                : 'Первый заказ есть. Укажите форму, ИНН, налоговый режим и СТС — после проверки у вас появится «Проверен», и заказчики будут выбирать вас чаще.'}
            </span>
          </a>
        )}
        {quickAccount && <SaveLoginForm />}
        {searchParams.welcome === '1' && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          >
            Готово, теперь вы исполнитель. Добавьте первую машину с ценой —{' '}
            <a href="#add-equipment" className="font-semibold underline">
              форма ниже
            </a>
            , и она появится в каталоге. Ваши заказы — в режиме «Заказчик».
          </p>
        )}
        <Hint id="provider" />

        <section id="income" aria-label="Сводка" className="flex scroll-mt-24 flex-col gap-3">
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
              <p className="mt-1 font-mono text-2xl font-bold text-graphite-950">
                {activeBookings}
              </p>
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
          <p className="text-sm text-graphite-600">
            Подходят вам: заявки на вашу технику в радиусе подачи, на которые вы ещё не ответили
            {feedTotal > feed.length && ` · показаны ${feed.length} из ${feedTotal}`}
          </p>
          {feed.length === 0 ? (
            <p className="cab-card text-sm text-graphite-600">
              {fleet.length === 0 ? (
                <>
                  Добавьте технику — здесь появятся заявки на неё рядом с вашей базой. Пока все
                  открытые заявки — во{' '}
                  <a href="/orders#board" className="font-semibold text-signal-700 underline">
                    всей ленте
                  </a>
                  .
                </>
              ) : (
                'Новых подходящих заявок без вашей цены нет. Оставайтесь на линии — лента обновляется сама.'
              )}
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
                    {maskContactsAndLinks(order.description)}
                  </p>
                  <p className="text-xs text-graphite-500">
                    {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                    {order.desiredEndDate.toLocaleDateString('ru-RU')} ·{' '}
                    {order.location?.city ? `${order.location.city} · ` : ''}
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

        <LineStandingCard
          machines={lineMachines.map((item) => ({
            id: item.id,
            name: item.name,
            available: item.status === 'AVAILABLE',
          }))}
          initial={lineState}
          hasBase={pinCompany?.baseLat != null && pinCompany?.baseLon != null}
          minDate={lineToday}
          maxDate={addDays(lineToday, STANDING_MAX_DAYS)}
        />

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

        {!isHouseManager(session.user) && fleet.length > 0 && (
          <AktualnoCard
            fresh={fleet.filter((item) => isAvailabilityFresh(item, new Date())).length}
            total={fleet.length}
          />
        )}

        <NoOrdersChecklist items={checklist} />

        {/* Income per machine, the occupancy calendar and the operators (an
          async server component, awaited so the JSX types stay simple). */}
        {await ProviderOpsSection({ companyId })}

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
              <MyMapPin company={pinCompany} photos={ownPhotos} uploadsEnabled />
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
                  expiredDocuments={expiredFor(item.id)}
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

        <section id="verification" className="flex scroll-mt-24 flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Документы и проверка</h2>
            <p className="text-sm text-graphite-600">
              Статус: {VERIFICATION_STATUS_TEXT[verification]}
              {profile?.taxRegime ? ` · налоговый режим: ${taxRegimeLabel(profile.taxRegime)}` : ''}
              {' · '}телефон {me?.phoneVerifiedAt ? 'подтверждён' : 'не подтверждён'}
            </p>
          </div>
          <div className="cab-card">
            <VerificationPanel machines={fleet.map((item) => ({ id: item.id, name: item.name }))} />
          </div>
        </section>

        <section id="documents" className="flex scroll-mt-24 flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Документы</h2>
            <p className="text-sm text-graphite-600">
              СТС, ПСМ, удостоверения машинистов, страховка и техосмотр — по компании и по каждой
              машине. Напомним за 30 дней до окончания срока и в день окончания.
            </p>
          </div>
          <div className="cab-card">
            <ProviderDocuments machines={fleet.map((item) => ({ id: item.id, name: item.name }))} />
          </div>
        </section>

        <section id="delivery" className="flex scroll-mt-24 flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Радиус выезда и подача</h2>
            <p className="text-sm text-graphite-600">
              Заявки присылаются в пределах радиуса от базы; цена за км подставляется в «подачу»
              предложения.
            </p>
          </div>
          <div className="cab-card max-w-xl">
            <DeliverySettingsForm
              initial={{
                deliveryRadiusKm: profile?.deliveryRadiusKm ?? 100,
                deliveryPricePerKm: profile?.deliveryPricePerKm?.toString() ?? null,
              }}
            />
          </div>
        </section>

        <section id="bids" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-lg font-semibold">Мои предложения</h2>
          {myBids.length === 0 ? (
            <p className="text-sm text-slate-600">
              Вы ещё не откликались. Откройте заявку выше и назовите свою цену.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {myBids.map((bid) => (
                <li key={bid.id}>
                  <a
                    href={`/orders/${bid.order.id}`}
                    className="cab-card flex flex-col gap-1 hover:border-signal-400 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="line-clamp-2 break-words font-semibold text-graphite-950">
                        {maskContactsAndLinks(bid.order.description)}
                      </span>
                      <span className="block text-graphite-500">
                        {bid.equipment.name} · {formatMoney(bid.price, bid.currency)}
                      </span>
                    </span>
                    <span className="cab-chip w-fit shrink-0">
                      {BID_STATUS[bid.status] ?? bid.status}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="bookings" className="flex scroll-mt-24 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Бронирования</h2>
            <p className="text-sm text-slate-600">
              Всего: {bookingsTotal}
              {bookingsTotalPages > 1 && ` · страница ${bookingsPage} из ${bookingsTotalPages}`}
            </p>
          </div>
          <div className="empty:hidden">
            <SupportPrompt completedIds={completedBookingIds(bookings)} />
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
                        Заказчик: {customer.name} · {booking.startDate.toLocaleDateString('ru-RU')}{' '}
                        – {booking.endDate.toLocaleDateString('ru-RU')} ·{' '}
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
                            <a
                              href={`mailto:${customer.email}`}
                              className="text-amber-700 underline"
                            >
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
                      <div className="mt-2">
                        <OperatorSelect
                          bookingId={booking.id}
                          bookingStatus={booking.status}
                          operatorId={booking.operatorId}
                          operators={operatorOptions}
                        />
                      </div>
                      <ShiftPanel
                        bookingId={booking.id}
                        bookingStatus={booking.status}
                        role="provider"
                      />
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
            priorityUntil={bonus?.priorityUntil}
          />
        )}
        {session && (
          <div id="notifications" className="scroll-mt-24">
            <NotificationSettings />
          </div>
        )}
        <ManagerCard
          phone={SITE.phone}
          phoneHref={SITE.phoneHref}
          telegram={`https://t.me/${SITE.telegramBot}`}
        />
      </div>
    </CabinetLayout>
  );
}
