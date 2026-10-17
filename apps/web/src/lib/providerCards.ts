// The public list of provider companies (/providers, GET /api/providers, the
// app's «Исполнители» screen): one card per company with its trust signals,
// fleet summary, base city and a few machine photos. Pure functions, unit-
// tested: fields are copied one by one, so a phone, an e-mail or a user that
// a query happens to include never reaches the response (contacts open only
// after a confirmed booking, CLAUDE.md). The query is in lib/providerCardsData.ts.

import { HOUSE_COMPANY_ID } from './fleet';
import { cityInText } from './geo';
import { pluralizeRu } from './pluralize';
import { isDisplayableImage } from './providerMap';
import { providerPath } from './providerSeo';
import { cancelLabel, reliability, type CompanyStats } from './reliability';

export const PROVIDER_SORT = ['rating', 'fleet', 'newest'] as const;
export type ProviderSort = (typeof PROVIDER_SORT)[number];
export const PROVIDER_SORT_LABELS: Record<ProviderSort, string> = {
  rating: 'По рейтингу',
  fleet: 'По размеру парка',
  newest: 'Сначала новые',
};

export interface ProviderQuery {
  group: string | null;
  city: string | null;
  sort: ProviderSort;
}

type ParamValue = string | string[] | undefined | null;

function first(value: ParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === null ? undefined : raw;
}

export function parseProviderQuery(params: {
  group?: ParamValue;
  city?: ParamValue;
  sort?: ParamValue;
}): ProviderQuery {
  const group = first(params.group)?.trim().slice(0, 64) || null;
  const city = first(params.city)?.trim().replace(/\s+/g, ' ').slice(0, 60) || null;
  const sort = first(params.sort) as ProviderSort | undefined;
  return {
    group: group && /^[\w-]+$/.test(group) ? group : null,
    city,
    sort: sort && PROVIDER_SORT.includes(sort) ? sort : 'rating',
  };
}

export function providersHref(query: Partial<ProviderQuery>, basePath = '/providers'): string {
  const params = new URLSearchParams();
  if (query.group) params.set('group', query.group);
  if (query.city) params.set('city', query.city);
  if (query.sort && query.sort !== 'rating') params.set('sort', query.sort);
  const text = params.toString();
  return text ? `${basePath}?${text}` : basePath;
}

/** What the query selects for one company (lib/providerCardsData.ts). */
export interface ProviderRow {
  id: string;
  name: string;
  verified: boolean;
  baseAddress: string | null;
  deliveryRadiusKm: number;
  createdAt: Date;
  pinImageUrl?: string | null;
  location?: { city: string | null } | null;
  equipment: { name: string; imageUrls: string[]; category: { id: string; name: string } }[];
}

/** One card: nothing personal, no phones, e-mails or addresses beyond the city. */
export interface ProviderCard {
  id: string;
  href: string;
  name: string;
  verified: boolean;
  isHouse: boolean;
  /** Average stars, one decimal; null without reviews. */
  rating: number | null;
  ratingCount: number;
  completed: number;
  /** «Без отмен» / «Отмены 12%»; null below the sample size. */
  cancelLabel: string | null;
  badges: string[];
  city: string;
  fleetCount: number;
  /** «12 машин: экскаваторы, краны, самосвалы». */
  fleetSummary: string;
  categories: string[];
  /** Ids of the category groups the fleet belongs to (for the filter). */
  groupIds: string[];
  /** Up to three machine photos (own uploads, the marker picture first). */
  photos: string[];
  radiusKm: number;
  /** «Выезд до 100 км». */
  radiusLabel: string;
  /** «на сервисе с октября 2026». */
  sinceLabel: string;
  orderHref: string;
  mapHref: string;
}

/**
 * The city a company is based in: a known Russian city named in the base
 * address (any case, «г. Казань» or «Казани»), else its location, else the
 * fallback (empty: the city is unknown).
 */
export function cityOf(
  baseAddress: string | null | undefined,
  locationCity: string | null | undefined,
  fallback: string,
): string {
  // «в Набережных Челнах», «г. Казань»: any case form (findCityInText).
  const named = cityInText(baseAddress);
  if (named) return named.name;
  const city = locationCity?.trim();
  return city || fallback;
}

const CATEGORY_PLURAL: [RegExp, string][] = [
  [/экскаватор.*погрузчик/i, 'экскаваторы-погрузчики'],
  [/экскаватор/i, 'экскаваторы'],
  [/погрузчик/i, 'погрузчики'],
  [/автокран|кран/i, 'краны'],
  [/манипулятор|кму/i, 'манипуляторы'],
  [/автовышк|вышк/i, 'автовышки'],
  [/самосвал/i, 'самосвалы'],
  [/бульдозер/i, 'бульдозеры'],
  [/грейдер/i, 'грейдеры'],
  [/каток/i, 'катки'],
  [/трал/i, 'тралы'],
  [/бетон|миксер/i, 'миксеры'],
  [/ямобур|бур/i, 'ямобуры'],
];

/** «Автокраны» → «краны»; unknown names are kept in lower case. */
export function categoryPlural(name: string): string {
  return CATEGORY_PLURAL.find(([pattern]) => pattern.test(name))?.[1] ?? name.toLowerCase();
}

/** «12 машин: экскаваторы, краны, самосвалы» (up to three kinds). */
export function fleetSummary(count: number, categories: readonly string[]): string {
  if (count === 0) return 'Техника пока не добавлена';
  const kinds = [...new Set(categories.map(categoryPlural))].slice(0, 3);
  const head = pluralizeRu(count, ['машина', 'машины', 'машин']);
  return kinds.length ? `${head}: ${kinds.join(', ')}` : head;
}

export function radiusLabel(km: number): string {
  return km > 0 ? `Выезд до ${Math.round(km)} км` : 'Выезд по договорённости';
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** «с октября 2026». */
export function sinceLabel(createdAt: Date): string {
  return `с ${MONTHS_GENITIVE[createdAt.getUTCMonth()]} ${createdAt.getUTCFullYear()}`;
}

/** One company → one card. `groupOf` maps a category id to its group id. */
export function toProviderCard(
  row: ProviderRow,
  stats: CompanyStats,
  options: { fallbackCity: string; groupOf?: (categoryId: string) => string | undefined },
): ProviderCard {
  const trust = reliability(stats);
  const categories = [...new Set(row.equipment.map((item) => item.category.name))];
  const groupIds = options.groupOf
    ? [
        ...new Set(
          row.equipment
            .map((item) => options.groupOf!(item.category.id))
            .filter((id): id is string => Boolean(id)),
        ),
      ]
    : [];
  const photos = [...new Set([row.pinImageUrl, ...row.equipment.flatMap((item) => item.imageUrls)])]
    .filter(isDisplayableImage)
    .slice(0, 3);
  return {
    id: row.id,
    href: providerPath(row.id),
    name: row.name.trim().slice(0, 120),
    verified: row.verified,
    isHouse: row.id === HOUSE_COMPANY_ID,
    rating: trust.rating,
    ratingCount: trust.ratingCount,
    completed: trust.completed,
    cancelLabel: trust.cancelShare === null ? null : cancelLabel(trust.cancelShare),
    badges: trust.badges,
    city: cityOf(row.baseAddress, row.location?.city, options.fallbackCity),
    fleetCount: row.equipment.length,
    fleetSummary: fleetSummary(row.equipment.length, categories),
    categories,
    groupIds,
    photos,
    radiusKm: row.deliveryRadiusKm,
    radiusLabel: radiusLabel(row.deliveryRadiusKm),
    sinceLabel: sinceLabel(row.createdAt),
    orderHref: `/orders?provider=${encodeURIComponent(row.id)}`,
    mapHref: '/map',
  };
}

/** Companies with nothing to show (no fleet and no base) stay out of the list. */
export function isListed(row: Pick<ProviderRow, 'baseAddress' | 'equipment'>): boolean {
  return row.equipment.length > 0 || Boolean(row.baseAddress?.trim());
}

export function filterProviderCards(
  cards: readonly ProviderCard[],
  query: Pick<ProviderQuery, 'group' | 'city'>,
): ProviderCard[] {
  const city = query.city?.toLowerCase();
  return cards.filter(
    (card) =>
      (!query.group || card.groupIds.includes(query.group)) &&
      (!city || card.city.toLowerCase() === city),
  );
}

/**
 * The house fleet first (the owner's rule), then verified companies, then the
 * chosen order: rating (reviewed companies ahead of unreviewed), fleet size or
 * newest on the service. Ties go alphabetically.
 */
export function sortProviderCards(
  cards: readonly ProviderCard[],
  sort: ProviderSort,
  createdAt: (card: ProviderCard) => number = () => 0,
): ProviderCard[] {
  const by: Record<ProviderSort, (a: ProviderCard, b: ProviderCard) => number> = {
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.ratingCount - a.ratingCount,
    fleet: (a, b) => b.fleetCount - a.fleetCount,
    newest: (a, b) => createdAt(b) - createdAt(a),
  };
  return [...cards].sort(
    (a, b) =>
      Number(b.isHouse) - Number(a.isHouse) ||
      Number(b.verified) - Number(a.verified) ||
      by[sort](a, b) ||
      a.name.localeCompare(b.name, 'ru'),
  );
}

/** The card of a company whose city is unknown (never shown as a city in the filter). */
export const UNKNOWN_CITY = 'Город не указан';

/** Distinct base cities of the listed companies, for the filter. */
export function providerCities(cards: readonly ProviderCard[]): string[] {
  return [...new Set(cards.map((card) => card.city))]
    .filter((city) => city && city !== UNKNOWN_CITY)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}
