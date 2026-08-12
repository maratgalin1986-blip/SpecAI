import { prisma } from '@specai/database';
import { Card, StatusBadge } from '@specai/ui';

export const dynamic = 'force-dynamic';

interface EquipmentSearchParams {
  category?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  q?: string;
}

export default async function EquipmentCatalogPage({
  searchParams,
}: {
  searchParams: EquipmentSearchParams;
}) {
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;

  const [categories, equipment] = await Promise.all([
    prisma.equipmentCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.equipment.findMany({
      where: {
        categoryId: searchParams.category || undefined,
        location: searchParams.city
          ? { city: { equals: searchParams.city, mode: 'insensitive' } }
          : undefined,
        dailyRate:
          minPrice !== undefined || maxPrice !== undefined
            ? { gte: minPrice, lte: maxPrice }
            : undefined,
        name: searchParams.q ? { contains: searchParams.q, mode: 'insensitive' } : undefined,
      },
      include: { category: true, location: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Equipment catalog</h1>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          Search
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Excavator, crane…"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            name="category"
            defaultValue={searchParams.category ?? ''}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City
          <input
            name="city"
            defaultValue={searchParams.city}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Min $/day
          <input
            name="minPrice"
            type="number"
            min={0}
            defaultValue={searchParams.minPrice}
            className="w-28 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max $/day
          <input
            name="maxPrice"
            type="number"
            min={0}
            defaultValue={searchParams.maxPrice}
            className="w-28 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Filter
        </button>
        {(searchParams.q ||
          searchParams.category ||
          searchParams.city ||
          searchParams.minPrice ||
          searchParams.maxPrice) && (
          <a href="/equipment" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Clear filters
          </a>
        )}
      </form>

      {equipment.length === 0 ? (
        <p className="text-slate-600">No equipment matches these filters.</p>
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
