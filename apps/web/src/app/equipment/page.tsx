import { prisma } from '@specai/database';
import { EQUIPMENT_SORT_OPTIONS } from '@specai/shared';
import { CallbackForm } from '@/components/CallbackForm';
import { EquipmentCard } from '@/components/EquipmentCard';
import { Icon } from '@/components/Icon';
import { Pagination } from '@/components/Pagination';
import { TASK_GROUPS, isTaskGroupId, taskGroupOf, type TaskGroupId } from '@/lib/equipmentCatalog';
import {
  EQUIPMENT_ORDER_BY,
  EQUIPMENT_SORT_LABELS,
  parseEnumParam,
  parsePage,
  totalPagesFor,
} from '@/lib/pagination';
import { pluralizeRu } from '@/lib/pluralize';
import { SITE } from '@/lib/site';
import { CinemaHero } from '@/components/CinemaHero';
import { PUBLISHED_FLEET } from '@/lib/fleet';

export const metadata = {
  title: 'Каталог спецтехники',
  description:
    'Аренда экскаваторов-погрузчиков, автокранов, погрузчиков и другой спецтехники с оператором в Набережных Челнах и по Татарстану.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

interface EquipmentSearchParams {
  category?: string;
  group?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  q?: string;
  sort?: string;
  page?: string;
  /** One provider's machinery (link «Техника этого поставщика» on /map). */
  company?: string;
}

const FILTER_KEYS = ['q', 'city', 'minPrice', 'maxPrice', 'sort', 'company'] as const;

/** Catalog link that keeps the search filters and replaces the category/group. */
function catalogHref(
  searchParams: EquipmentSearchParams,
  selection: { group?: string; category?: string },
) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }
  if (selection.group) params.set('group', selection.group);
  if (selection.category) params.set('category', selection.category);
  const query = params.toString();
  return query ? `/equipment?${query}` : '/equipment';
}

function Pill({
  href,
  active,
  label,
  count,
  small = false,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  small?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-semibold transition ${
        small ? 'px-3.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      } ${
        active
          ? 'bg-slate-950 text-white'
          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-950'
      }`}
    >
      {label}
      <span
        className={`font-mono tabular-nums ${small ? 'text-[0.65rem]' : 'text-xs'} ${
          active ? 'text-amber-400' : 'text-slate-400'
        }`}
      >
        {count}
      </span>
    </a>
  );
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

  // Filters other than the category: the tab counts are computed against these.
  const companyFilter =
    searchParams.company && /^[\w-]{1,64}$/.test(searchParams.company)
      ? await prisma.company.findFirst({
          where: { id: searchParams.company, isProvider: true },
          select: { id: true, name: true },
        })
      : null;

  const baseWhere = {
    ...PUBLISHED_FLEET,
    companyId: companyFilter?.id,
    location: searchParams.city
      ? { city: { equals: searchParams.city, mode: 'insensitive' as const } }
      : undefined,
    dailyRate:
      minPrice !== undefined || maxPrice !== undefined
        ? { gte: minPrice, lte: maxPrice }
        : undefined,
    name: searchParams.q ? { contains: searchParams.q, mode: 'insensitive' as const } : undefined,
  };

  const [categories, countsByCategory] = await Promise.all([
    prisma.equipmentCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.equipment.groupBy({ by: ['categoryId'], where: baseWhere, _count: { _all: true } }),
  ]);

  const countOf = new Map(countsByCategory.map((row) => [row.categoryId, row._count._all]));
  const categoryRows = categories.map((category) => ({
    ...category,
    group: taskGroupOf(category.name),
    count: countOf.get(category.id) ?? 0,
  }));

  const selectedCategory = categoryRows.find((category) => category.id === searchParams.category);
  const activeGroup: TaskGroupId | undefined =
    selectedCategory?.group ?? (isTaskGroupId(searchParams.group) ? searchParams.group : undefined);

  const groupTabs = TASK_GROUPS.map((group) => {
    const members = categoryRows.filter((category) => category.group === group.id);
    return {
      ...group,
      members,
      count: members.reduce((sum, category) => sum + category.count, 0),
    };
  }).filter((group) => group.count > 0 || group.id === activeGroup);
  const allCount = categoryRows.reduce((sum, category) => sum + category.count, 0);
  const activeGroupTab = groupTabs.find((group) => group.id === activeGroup);

  const where = {
    ...baseWhere,
    categoryId: selectedCategory
      ? selectedCategory.id
      : searchParams.category
        ? searchParams.category
        : activeGroupTab
          ? { in: activeGroupTab.members.map((category) => category.id) }
          : undefined,
  };

  const total = await prisma.equipment.count({ where });
  const totalPages = totalPagesFor(total, PAGE_SIZE);
  const page = Math.min(requestedPage, totalPages);

  const equipment = await prisma.equipment.findMany({
    where,
    include: { category: true, location: true, company: { select: { name: true } } },
    orderBy: EQUIPMENT_ORDER_BY[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const hasFilters = Boolean(
    searchParams.q ||
    searchParams.category ||
    searchParams.group ||
    searchParams.city ||
    searchParams.minPrice ||
    searchParams.maxPrice,
  );

  const hasSecondaryFilters = Boolean(
    searchParams.city || searchParams.minPrice || searchParams.maxPrice || searchParams.sort,
  );

  const field =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';

  return (
    <div className="flex flex-col gap-8">
      <CinemaHero
        eyebrow={`Каталог · ${SITE.city} и Татарстан`}
        title="Спецтехника в аренду"
        clips={['site-aerial', 'excavator-truck', 'city-cranes']}
        camera={2}
      >
        <p>
          Цена за час и за смену 8 часов — на каждой карточке. Оставьте телефон прямо в карточке:{' '}
          {SITE.callbackPromise.toLowerCase()}.
        </p>
        <a
          href={SITE.phoneHref}
          className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
        >
          <Icon name="phone" className="h-4 w-4" />
          {SITE.phone}
        </a>
        <a
          href="/map"
          className="ml-2 mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white"
        >
          Исполнители на карте
        </a>
      </CinemaHero>

      {companyFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span>
            Техника поставщика <strong className="break-words">{companyFilter.name}</strong>
          </span>
          <span className="flex gap-3 font-semibold">
            <a href="/map" className="text-amber-800 underline">
              На карте
            </a>
            <a
              href={catalogHref({ ...searchParams, company: undefined }, {})}
              className="text-amber-800 underline"
            >
              Вся техника
            </a>
          </span>
        </div>
      )}

      <nav aria-label="Категории техники" className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Pill
            href={catalogHref(searchParams, {})}
            active={!activeGroup && !searchParams.category}
            label="Вся техника"
            count={allCount}
          />
          {groupTabs.map((group) => (
            <Pill
              key={group.id}
              href={catalogHref(searchParams, { group: group.id })}
              active={group.id === activeGroup && !selectedCategory}
              label={group.label}
              count={group.count}
            />
          ))}
        </div>
        {activeGroupTab && activeGroupTab.members.filter((c) => c.count > 0).length > 1 && (
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <span className="eyebrow shrink-0 text-[0.65rem] text-slate-400">
              {activeGroupTab.label}:
            </span>
            {activeGroupTab.members
              .filter((category) => category.count > 0 || category.id === selectedCategory?.id)
              .map((category) => (
                <Pill
                  key={category.id}
                  small
                  href={catalogHref(searchParams, { category: category.id })}
                  active={category.id === selectedCategory?.id}
                  label={category.name}
                  count={category.count}
                />
              ))}
          </div>
        )}
      </nav>

      <form
        method="get"
        className="grid grid-cols-2 items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(2,minmax(0,0.9fr))_minmax(0,1.3fr)_auto]"
      >
        {searchParams.category && (
          <input type="hidden" name="category" value={searchParams.category} />
        )}
        {companyFilter && <input type="hidden" name="company" value={companyFilter.id} />}
        {!searchParams.category && activeGroup && (
          <input type="hidden" name="group" value={activeGroup} />
        )}
        <label className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
          <span className="eyebrow text-[0.65rem] text-slate-500">Поиск</span>
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Экскаватор, кран, JCB…"
            className={field}
          />
        </label>
        {/* Phones: the secondary filters fold away behind «Фильтры» (CSS only). */}
        <input
          type="checkbox"
          id="catalog-more-filters"
          aria-label="Показать все фильтры"
          className="peer sr-only"
          defaultChecked={hasSecondaryFilters}
        />
        <label className="col-span-2 hidden flex-col gap-1.5 peer-checked:flex sm:col-span-1 sm:flex">
          <span className="eyebrow text-[0.65rem] text-slate-500">Город</span>
          <input
            name="city"
            defaultValue={searchParams.city}
            placeholder="Любой"
            className={field}
          />
        </label>
        <label className="hidden flex-col gap-1.5 peer-checked:flex sm:flex">
          <span className="eyebrow text-[0.65rem] text-slate-500">Смена от, ₽</span>
          <input
            name="minPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={searchParams.minPrice}
            className={`${field} font-mono`}
          />
        </label>
        <label className="hidden flex-col gap-1.5 peer-checked:flex sm:flex">
          <span className="eyebrow text-[0.65rem] text-slate-500">Смена до, ₽</span>
          <input
            name="maxPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={searchParams.maxPrice}
            className={`${field} font-mono`}
          />
        </label>
        <label className="col-span-2 hidden flex-col gap-1.5 peer-checked:flex sm:col-span-1 sm:flex">
          <span className="eyebrow text-[0.65rem] text-slate-500">Сортировка</span>
          <select name="sort" defaultValue={sort} className={field}>
            {EQUIPMENT_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {EQUIPMENT_SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
          <label
            htmlFor="catalog-more-filters"
            className="flex-1 cursor-pointer rounded-full border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 sm:hidden"
          >
            Фильтры
          </label>
          <button
            type="submit"
            className="flex-1 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 lg:w-auto lg:flex-none"
          >
            Найти
          </button>
        </div>
      </form>

      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p aria-live="polite">
          <span className="font-mono font-semibold text-slate-900">
            {pluralizeRu(total, ['единица', 'единицы', 'единиц'])}
          </span>{' '}
          техники
          {selectedCategory && ` · ${selectedCategory.name}`}
          {!selectedCategory && activeGroupTab && ` · ${activeGroupTab.label.toLowerCase()}`}
          {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
        </p>
        {hasFilters && (
          <a href="/equipment" className="font-medium text-slate-500 hover:text-slate-900">
            Сбросить фильтры ×
          </a>
        )}
      </div>

      {equipment.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-8">
            <div className="eyebrow text-amber-700">Ничего не нашлось</div>
            <h2 className="text-2xl font-bold tracking-tight">
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
              Не нашли нужную машину — оставьте{' '}
              <a href="/orders" className="text-amber-700 underline">
                заявку
              </a>
              , подскажем, чем {SITE.name} закроет вашу задачу.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <CallbackForm source="catalog-empty" />
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item) => (
            <EquipmentCard key={item.id} item={item} />
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
