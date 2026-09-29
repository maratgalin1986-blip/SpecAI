import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card, StatusBadge } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { formatMoney, formatRate } from '@/lib/money';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';
import { Pagination } from '@/components/Pagination';
import { parsePage, totalPagesFor } from '@/lib/pagination';
import { CinemaLayer } from '@/components/CinemaHero';
import { Icon, type IconName } from '@/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Поставщикам техники',
  description: `Сдавайте спецтехнику в аренду через ${SITE.name}: заявки клиентов, бронирования, ИИ-помощник.`,
};

const PROVIDER_BENEFITS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'inbox',
    title: 'Заявки клиентов',
    text: 'Клиенты публикуют задачи — вы предлагаете свою технику и цену.',
  },
  {
    icon: 'calendar',
    title: 'Бронирования онлайн',
    text: 'Подтверждайте брони и следите за загрузкой парка в одном кабинете.',
  },
  {
    icon: 'spark',
    title: 'ИИ заполнит карточку',
    text: 'Вставьте текст из паспорта техники — ИИ разложит характеристики по полям.',
  },
  {
    icon: 'tag',
    title: 'Бесплатное размещение',
    text: 'Регистрация и размещение техники ничего не стоят.',
  },
];

function ProviderLanding({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl sm:p-10 sm:py-16">
        <CinemaLayer clips={['site-aerial', 'steel-frame', 'crane-sun']} />
        <div className="cine-eyebrow text-sm font-semibold uppercase tracking-widest text-amber-400">
          Для владельцев техники
        </div>
        <h1 className="cine-title mt-2 text-3xl font-bold sm:text-5xl">
          Сдавайте спецтехнику в аренду без простоев
        </h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Разместите парк на {SITE.name} и получайте заказы от клиентов по всему Татарстану.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {signedIn ? (
            <p className="rounded-md bg-white/10 px-4 py-3 text-sm">
              Вы вошли как клиент. Чтобы размещать технику, зарегистрируйте отдельный аккаунт
              поставщика.
            </p>
          ) : (
            <>
              <a
                href="/register"
                className="rounded-md bg-amber-500 px-6 py-3 font-semibold text-slate-950 hover:bg-amber-400"
              >
                Зарегистрироваться как поставщик
              </a>
              <a
                href="/login?callbackUrl=/provider"
                className="rounded-md px-6 py-3 font-semibold ring-1 ring-white/30 hover:bg-white/10"
              >
                Войти
              </a>
            </>
          )}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDER_BENEFITS.map((benefit) => (
          <Card key={benefit.title}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
              <Icon name={benefit.icon} className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-semibold">{benefit.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{benefit.text}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <CallbackForm
          source="provider"
          title="Есть вопросы по размещению?"
          subtitle="Оставьте телефон — расскажем, как начать получать заказы."
        />
      </Card>
    </div>
  );
}

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

  if (!session || session.user.role !== 'PROVIDER_ADMIN' || !session.user.companyId) {
    return <ProviderLanding signedIn={Boolean(session)} />;
  }

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

  const [equipment, bookings] = await Promise.all([
    prisma.equipment.findMany({
      where: equipmentWhere,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: (equipmentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.findMany({
      where: bookingsWhere,
      include: { equipment: true, customer: true },
      orderBy: { createdAt: 'desc' },
      skip: (bookingsPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // The two lists are paginated independently: `page` drives equipment,
  // `bookingsPage` drives bookings, and each keeps the other's value.
  const currentQuery = {
    page: equipmentPage > 1 ? String(equipmentPage) : undefined,
    bookingsPage: bookingsPage > 1 ? String(bookingsPage) : undefined,
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Кабинет поставщика</h1>

      <section className="flex flex-col gap-3">
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
              <Card key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    {item.category.name} · {formatRate(item).price}
                    {formatRate(item).unit}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={item.status} />
                </div>
              </Card>
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

      <section>
        <h2 className="mb-3 text-lg font-semibold">Добавить технику</h2>
        <Card className="max-w-xl">
          <NewEquipmentForm />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
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
            {bookings.map((booking) => (
              <Card
                key={booking.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{booking.equipment.name}</p>
                  <p className="text-sm text-slate-500">
                    {booking.customer.name} · {booking.startDate.toLocaleDateString('ru-RU')} –{' '}
                    {booking.endDate.toLocaleDateString('ru-RU')} ·{' '}
                    {formatMoney(booking.totalPrice, booking.currency)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <BookingStatusBadge status={booking.status} />
                  <BookingActionButtons
                    bookingId={booking.id}
                    availableTransitions={PROVIDER_ALLOWED_TRANSITIONS[booking.status] ?? []}
                  />
                </div>
              </Card>
            ))}
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
    </div>
  );
}
