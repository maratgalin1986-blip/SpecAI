import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { Card, StatusBadge } from '@specai/ui';

export const dynamic = 'force-dynamic';

export default async function EquipmentDetailPage({ params }: { params: { id: string } }) {
  const item = await prisma.equipment.findUnique({
    where: { id: params.id },
    include: { category: true, location: true, company: true },
  });

  if (!item) {
    notFound();
  }

  const specs = (item.specs as Record<string, unknown> | null) ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          <p className="text-slate-500">
            {item.category.name} · Listed by {item.company.name}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <h2 className="font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {item.description ?? 'No description provided.'}
          </p>

          {Object.keys(specs).length > 0 && (
            <>
              <h2 className="mt-6 font-semibold">Specifications</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(specs).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-slate-500">{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-2xl font-semibold">
            ${item.dailyRate.toString()}
            <span className="text-sm font-normal text-slate-500">/day</span>
          </p>
          {item.weeklyRate && (
            <p className="text-sm text-slate-600">${item.weeklyRate.toString()}/week</p>
          )}
          {item.monthlyRate && (
            <p className="text-sm text-slate-600">${item.monthlyRate.toString()}/month</p>
          )}
          {item.location && (
            <p className="text-sm text-slate-500">
              {item.location.city}, {item.location.country}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
