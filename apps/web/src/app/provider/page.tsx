import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card, StatusBadge } from '@specai/ui';
import { authOptions } from '@/lib/auth';
import { NewEquipmentForm } from '@/components/NewEquipmentForm';
import { BookingActionButtons } from '@/components/BookingActionButtons';

export const dynamic = 'force-dynamic';

const PROVIDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
};

export default async function ProviderPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'PROVIDER_ADMIN' || !session.user.companyId) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-slate-600">
          Эта страница доступна только аккаунтам поставщиков техники.
        </p>
      </div>
    );
  }

  const [equipment, bookings] = await Promise.all([
    prisma.equipment.findMany({
      where: { companyId: session.user.companyId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findMany({
      where: { equipment: { companyId: session.user.companyId } },
      include: { equipment: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Кабинет поставщика</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Ваша техника</h2>
        {equipment.length === 0 ? (
          <p className="text-sm text-slate-600">Техника пока не добавлена.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => (
              <Card key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    {item.category.name} · ${item.dailyRate.toString()}/день
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={item.status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Добавить технику</h2>
        <Card className="max-w-xl">
          <NewEquipmentForm />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Бронирования</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">Бронирований пока нет.</p>
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
                    {booking.endDate.toLocaleDateString('ru-RU')} · ${booking.totalPrice.toString()}{' '}
                    {booking.currency}
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
      </section>
    </div>
  );
}
