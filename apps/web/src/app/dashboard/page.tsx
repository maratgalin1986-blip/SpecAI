import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { BookingStatusBadge, Card } from '@specai/ui';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [equipmentCount, activeBookings, companies, myBookings] = await Promise.all([
    prisma.equipment.count(),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    prisma.company.count({ where: { isProvider: true } }),
    session
      ? prisma.booking.findMany({
          where: { customerId: session.user.id },
          include: { equipment: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const stats = [
    { label: 'Equipment listed', value: equipmentCount },
    { label: 'Active bookings', value: activeBookings },
    { label: 'Provider companies', value: companies },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">My bookings</h2>
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myBookings.map((booking) => (
              <Card key={booking.id} className="flex items-center justify-between">
                <div>
                  <a
                    href={`/equipment/${booking.equipmentId}`}
                    className="font-medium hover:text-amber-700"
                  >
                    {booking.equipment.name}
                  </a>
                  <p className="text-sm text-slate-500">
                    {booking.startDate.toDateString()} – {booking.endDate.toDateString()} · $
                    {booking.totalPrice.toString()} {booking.currency}
                  </p>
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
