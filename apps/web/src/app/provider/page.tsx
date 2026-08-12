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
        <p className="text-slate-600">This page is only available to provider admin accounts.</p>
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
      <h1 className="text-2xl font-bold">Provider dashboard</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your equipment</h2>
        {equipment.length === 0 ? (
          <p className="text-sm text-slate-600">No equipment listed yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((item) => (
              <Card key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    {item.category.name} · ${item.dailyRate.toString()}/day
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">List new equipment</h2>
        <Card className="max-w-xl">
          <NewEquipmentForm />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <Card key={booking.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{booking.equipment.name}</p>
                  <p className="text-sm text-slate-500">
                    {booking.customer.name} · {booking.startDate.toDateString()} –{' '}
                    {booking.endDate.toDateString()} · ${booking.totalPrice.toString()}{' '}
                    {booking.currency}
                  </p>
                </div>
                <div className="flex items-center gap-3">
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
