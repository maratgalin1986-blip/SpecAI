import { prisma } from '@specai/database';
import { Card } from '@specai/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [equipmentCount, activeBookings, companies] = await Promise.all([
    prisma.equipment.count(),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    prisma.company.count({ where: { isProvider: true } }),
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
    </div>
  );
}
