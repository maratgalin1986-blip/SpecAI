import { prisma } from '@specai/database';
import { EQUIPMENT_SORT_OPTIONS } from '@specai/shared';
import { Card, StatusBadge } from '@specai/ui';
import { formatMoney } from '@/lib/money';
import { CallbackForm } from '@/components/CallbackForm';
import { Pagination } from '@/components/Pagination';
import {
  EQUIPMENT_ORDER_BY,
  EQUIPMENT_SORT_LABELS,
  parseEnumParam,
  parsePage,
  totalPagesFor,
} from '@/lib/pagination';

export const metadata = {
  title: 'Каталог спецтехники',
  description:
    'Аренда экскаваторов, кранов, погрузчиков, самосвалов и бульдозеров в Казани и Татарстане.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

interface EquipmentSearchParams {
  category?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  q?: string;
  sort?: string;
  page?: string;
}

function pluralUnits(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'единица';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'единицы';
  return 'единиц';
}

export default async function EquipmentCatalogPage({
  searchParams,
}: {
  searchParams: EquipmentSearchParams;
}) {
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;
  const sort = parseEnumParam(searchParams.sort, EQUIPMENT_SORT_OPTIONS, 'newest');
  const requestedPage = parsePage(searchParams.page);

  const where = {
    categoryId: searchParams.category || undefined,
    location: searchParams.city
      ? { city: { equals: searchParams.city, mode: 'insensitive' as const } }
      : undefined,
    dailyRate:
      minPrice !== undefined || maxPrice !== undefined
        ? { gte: minPrice, lte: maxPrice }
        : undefined,
    name: searchParams.q ? { contains: searchParams.q, mode: 'insensitive' as const } : undefined,
  };

  const [categories, total] = await Promise.all([
    prisma.equipmentCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.equipment.count({ where }),
  ]);

  const totalPages = totalPagesFor(total, PAGE_SIZE);
  const page = Math.min(requestedPage, totalPages);

  const equipment = await prisma.equipment.findMany({
    where,
    include: { category: true, location: true },
    orderBy: EQUIPMENT_ORDER_BY[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const hasFilters = Boolean(
    searchParams.q ||
    searchParams.category ||
    searchParams.city ||
    searchParams.minPrice ||
    searchParams.maxPrice,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Каталог техники</h1>

      <form
        method="get"
        className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:flex lg:flex-wrap"
      >
        <label className="flex flex-col gap-1 text-sm">
          Поиск
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Экскаватор, кран…"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Категория
          <select
            name="category"
            defaultValue={searchParams.category ?? ''}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Все категории</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Город
          <input
            name="city"
            defaultValue={searchParams.city}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Цена от, ₽/сутки
          <input
            name="minPrice"
            type="number"
            min={0}
            defaultValue={searchParams.minPrice}
            className="w-full rounded-md border border-slate-300 px-3 py-2 lg:w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Цена до, ₽/сутки
          <input
            name="maxPrice"
            type="number"
            min={0}
            defaultValue={searchParams.maxPrice}
            className="w-full rounded-md border border-slate-300 px-3 py-2 lg:w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Сортировка
          <select
            name="sort"
            defaultValue={sort}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {EQUIPMENT_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {EQUIPMENT_SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-auto">
          <button
            type="submit"
            className="w-full rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 sm:w-auto"
          >
            Применить
          </button>
          {hasFilters && (
            <a
              href="/equipment"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Сбросить фильтры
            </a>
          )}
        </div>
      </form>

      <p className="text-sm text-slate-600" aria-live="polite">
        Найдено {total} {pluralUnits(total)}
        {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
      </p>

      {equipment.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col justify-center gap-2 p-6">
            <div className="text-4xl">🔍</div>
            <h2 className="text-lg font-semibold">
              {hasFilters ? 'По этим фильтрам техника не найдена' : 'Каталог пополняется'}
            </h2>
            <p className="text-sm text-slate-600">
              {hasFilters && (
                <>
                  Попробуйте изменить запрос или{' '}
                  <a href="/equipment" className="font-medium text-amber-700 hover:underline">
                    сбросить фильтры
                  </a>
                  .{' '}
                </>
              )}
              Часть парка мы подбираем под заказ — оставьте заявку, найдём технику под вашу задачу,
              или разместите{' '}
              <a href="/orders" className="text-amber-700 underline">
                заявку для поставщиков
              </a>
              .
            </p>
          </Card>
          <Card className="p-6">
            <CallbackForm source="catalog-empty" />
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item) => (
            <a key={item.id} href={`/equipment/${item.id}`}>
              <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                {item.imageUrls[0] && (
                  <img
                    src={item.imageUrls[0]}
                    alt={item.name}
                    className="-mx-1 -mt-1 h-40 w-[calc(100%+0.5rem)] rounded-md object-cover"
                  />
                )}
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
                  {formatMoney(item.dailyRate, item.currency)}
                  <span className="text-sm font-normal text-slate-500">/сутки</span>
                </p>
              </Card>
            </a>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/equipment"
        searchParams={{ ...searchParams, page: undefined }}
      />
    </div>
  );
}
