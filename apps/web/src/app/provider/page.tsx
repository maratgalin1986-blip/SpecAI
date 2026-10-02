import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card, StatusBadge } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';
import { formatMoney, formatRate } from '@/lib/money';
import { SITE } from '@/lib/site';
import { Pagination } from '@/components/Pagination';
import { parsePage, totalPagesFor } from '@/lib/pagination';
import { isProvider } from '@/lib/fleet';
import { MyMapPin } from '@/components/MyMapPin';
import { getBlobToken } from '@/lib/blob';
import { isDisplayableImage } from '@/lib/providerMap';

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

  // Only the owner's fleet account manages the fleet: СпецПласт16 is the only
  // executor on the site, there is no sign-up for outside providers.
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
      include: { equipment: true, customer: true },
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
  const ownPhotos = [...new Set(photoRows.flatMap((row) => row.imageUrls))]
    .filter(isDisplayableImage)
    .slice(0, 40);

  // The two lists are paginated independently: `page` drives equipment,
  // `bookingsPage` drives bookings, and each keeps the other's value.
  const currentQuery = {
    page: equipmentPage > 1 ? String(equipmentPage) : undefined,
    bookingsPage: bookingsPage > 1 ? String(bookingsPage) : undefined,
  };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Кабинет парка СпецПласт16</h1>

      {pinCompany && (
        <section id="map-pin" className="flex flex-col gap-3">
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
