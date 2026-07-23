import { prisma } from '@specai/database';
import { Card, StatusBadge } from '@specai/ui';

export const dynamic = 'force-dynamic';

export default async function EquipmentCatalogPage() {
  const equipment = await prisma.equipment.findMany({
    include: { category: true, location: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Equipment catalog</h1>

      {equipment.length === 0 ? (
        <p className="text-slate-600">No equipment listed yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item) => (
            <a key={item.id} href={`/equipment/${item.id}`}>
              <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{item.name}</h2>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-sm text-slate-500">{item.category.name}</p>
                {item.location && (
                  <p className="text-sm text-slate-500">
                    {item.location.city}, {item.location.country}
                  </p>
                )}
                <p className="mt-auto text-lg font-semibold">
                  ${item.dailyRate.toString()}
                  <span className="text-sm font-normal text-slate-500">/day</span>
                </p>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
