import type { Metadata } from 'next';
import { ReliabilityBadges } from '@/components/ReliabilityBadges';
import type { Reliability } from '@/lib/reliability';
import {
  PROVIDER_SORT,
  PROVIDER_SORT_LABELS,
  parseProviderQuery,
  providersHref,
  type ProviderCard,
} from '@/lib/providerCards';
import { loadProviderCards } from '@/lib/providerCardsData';
import { pluralizeRu } from '@/lib/pluralize';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Исполнители — компании со своей спецтехникой',
  description: `Компании и частники со своей спецтехникой в ${SITE.city} и по Татарстану: парк, база, рейтинг и отзывы. Заявка бесплатно — исполнители сами пришлют цены.`,
  alternates: { canonical: '/providers' },
};

const field =
  'w-full rounded-xl border border-graphite-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-signal-600 focus:ring-2 focus:ring-signal-200';

function ProviderListCard({ card }: { card: ProviderCard }) {
  // The chips are the ones lib/reliability.ts computed for the card.
  const trust: Reliability = {
    verified: card.verified,
    completed: card.completed,
    cancelShare: null,
    rating: card.rating,
    ratingCount: card.ratingCount,
    badges: card.badges,
    recommends: null,
  };
  return (
    <li>
      <article
        className="cab-card flex h-full flex-col gap-3 transition hover:border-signal-400"
        data-provider-card={card.id}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="cab-eyebrow">{card.isHouse ? `Парк ${SITE.name}` : card.city}</p>
            <h3 className="mt-1 break-words text-lg font-bold leading-tight text-graphite-950">
              <a href={card.href} className="hover:underline">
                {card.name}
              </a>
            </h3>
          </div>
          {card.rating !== null && (
            <p className="shrink-0 text-right">
              <span className="text-xl font-extrabold text-graphite-950">
                ★ {card.rating.toFixed(1)}
              </span>
              <span className="block text-xs text-graphite-500">
                {pluralizeRu(card.ratingCount, ['отзыв', 'отзыва', 'отзывов'])}
              </span>
            </p>
          )}
        </div>

        {card.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-1.5" aria-label="Техника исполнителя">
            {card.photos.map((photo) => (
              <li key={photo} className="aspect-[4/3] overflow-hidden rounded-xl bg-graphite-100">
                <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-graphite-800">{card.fleetSummary}</p>
        <ReliabilityBadges value={trust} />
        <dl className="grid grid-cols-2 gap-2 text-xs text-graphite-600">
          <div>
            <dt className="text-graphite-400">База</dt>
            <dd className="font-semibold text-graphite-800">
              {card.isHouse ? SITE.city : card.city || 'не указана'}
            </dd>
          </div>
          <div>
            <dt className="text-graphite-400">Выезд</dt>
            <dd className="font-semibold text-graphite-800">{card.radiusLabel}</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <a href={card.orderHref} className="cab-action" data-provider-order={card.id}>
            Заказать у этой компании
          </a>
          <a href={card.href} className="cab-ghost">
            Подробнее
          </a>
          <a
            href={card.mapHref}
            className="text-sm font-semibold text-graphite-600 hover:text-graphite-900"
          >
            На карте →
          </a>
        </div>
      </article>
    </li>
  );
}

// All provider companies with a published fleet or a base, СпецПласт16 first,
// then the checked ones; filters by the kind of machinery and the base city.
export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: { group?: string; city?: string; sort?: string };
}) {
  const query = parseProviderQuery(searchParams);
  const list = await loadProviderCards(query);
  const hasFilters = Boolean(query.group || query.city);
  const pill = (active: boolean) =>
    active
      ? 'shrink-0 rounded-full bg-graphite-950 px-4 py-2 text-sm font-semibold text-white'
      : 'shrink-0 rounded-full border border-graphite-200 bg-white px-4 py-2 text-sm font-semibold text-graphite-700 hover:border-graphite-900';

  return (
    <div className="flex flex-col gap-6">
      <header className="cab-dark flex flex-col gap-3 sm:p-8">
        <p className="cab-eyebrow text-signal-300">Исполнители · {SITE.city} и Татарстан</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Компании со своей техникой
        </h1>
        <p className="max-w-2xl text-graphite-200">
          {list.total > 0
            ? `${pluralizeRu(list.total, ['исполнитель', 'исполнителя', 'исполнителей'])} на площадке. `
            : ''}
          Оставьте одну заявку — подходящие исполнители пришлют цены. Отметка «Проверен» значит, что
          администратор проверил компанию и документы. Телефон исполнителя откроется после
          подтверждения брони.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/orders#new" className="cab-action" data-cta="place-order">
            Разместить заявку
          </a>
          <a
            href="/register?type=provider"
            className="cab-ghost border-graphite-600 bg-transparent text-white hover:border-white"
            data-cta="join-provider"
          >
            Встать на линию
          </a>
          <a
            href="/map"
            className="cab-ghost border-graphite-600 bg-transparent text-white hover:border-white"
          >
            На карте
          </a>
        </div>
      </header>

      {list.groups.length > 0 && (
        <nav
          aria-label="Вид техники"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <a
            href={providersHref({ ...query, group: null })}
            aria-current={!query.group ? 'page' : undefined}
            className={pill(!query.group)}
          >
            Все
          </a>
          {list.groups.map((group) => (
            <a
              key={group.id}
              href={providersHref({ ...query, group: group.id })}
              aria-current={group.id === query.group ? 'page' : undefined}
              className={pill(group.id === query.group)}
            >
              {group.label}
            </a>
          ))}
        </nav>
      )}

      <form
        method="get"
        action="/providers"
        className="grid grid-cols-2 items-end gap-3 rounded-3xl border border-graphite-100 bg-white p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:p-5"
      >
        {query.group && <input type="hidden" name="group" value={query.group} />}
        <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="cab-eyebrow text-graphite-500">Город базы</span>
          <select name="city" defaultValue={query.city ?? ''} className={field}>
            <option value="">Любой</option>
            {list.cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
            {query.city && !list.cities.includes(query.city) && (
              <option value={query.city}>{query.city}</option>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cab-eyebrow text-graphite-500">Сортировка</span>
          <select name="sort" defaultValue={query.sort} className={field}>
            {PROVIDER_SORT.map((sort) => (
              <option key={sort} value={sort}>
                {PROVIDER_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="cab-action">
          Показать
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-graphite-600">
        <p aria-live="polite">
          Найдено: {list.cards.length}
          {list.cards.length !== list.total && ` из ${list.total}`}
        </p>
        {hasFilters && (
          <a href="/providers" className="font-medium text-graphite-500 hover:text-graphite-900">
            Сбросить фильтры ×
          </a>
        )}
      </div>

      {list.failed ? (
        <p role="status" className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Список исполнителей сейчас не загрузился. Заявку можно оставить по телефону{' '}
          <a href={SITE.phoneHref} className="font-semibold text-amber-800 underline">
            {SITE.phone}
          </a>
          .
        </p>
      ) : list.cards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-graphite-200 bg-white p-8 text-center">
          <p className="font-semibold text-graphite-800">
            {hasFilters
              ? 'По этим фильтрам исполнителей нет'
              : 'Список исполнителей скоро появится'}
          </p>
          <p className="mt-2 text-sm text-graphite-600">
            {hasFilters ? (
              <a href="/providers" className="font-medium text-signal-700 hover:underline">
                Показать всех
              </a>
            ) : (
              <>
                Своя техника?{' '}
                <a
                  href="/register?type=provider"
                  className="font-medium text-signal-700 hover:underline"
                >
                  Встаньте на линию первым
                </a>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.cards.map((card) => (
            <ProviderListCard key={card.id} card={card} />
          ))}
        </ul>
      )}
    </div>
  );
}
