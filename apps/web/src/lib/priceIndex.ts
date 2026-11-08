// «Цены на рынке» (2026-10-18): an anonymous index of hourly prices with an
// operator, from what other providers publish on ИИСтройка24 and from the open
// price survey (lib/priceReports.ts). Pure functions, unit-tested.
//
// Rules (honesty and k-anonymity):
// - СпецПласт16's own fleet is never in the index: its prices are the owner's
//   list (lib/prices.ts), and the index is about the other providers.
// - Every company (or survey participant) counts once per number: its own
//   machines of a category in a place are first reduced to their median.
// - A number is shown only when at least INDEX_MIN_REPORTERS different
//   companies/participants stand behind it; otherwise «мало данных». No names,
//   no single prices, no machines; gaps are never filled with invented numbers.
// - What a survey participant is shown back excludes his own answer, so he
//   never learns another single price by comparing (lookupPrice `exclude`).

import { categoryName, CATEGORIES, POPULAR_CATEGORY_SLUGS } from '@specai/shared';

/** The least number of different companies or participants behind a number. */
export const INDEX_MIN_REPORTERS = 3;
/** The range (lowest–highest) is shown only from this many on. */
export const INDEX_RANGE_MIN_REPORTERS = 5;

/** One price: a machine of a provider company, or one survey answer. */
export interface PricePoint {
  categorySlug: string;
  /** «c:<companyId>» for a provider's machine, «r:<hash>» for a survey answer. */
  reporter: string;
  /** ₽ per hour with the operator. */
  hourly: number;
  /** The city as in @specai/shared RUSSIAN_CITIES («Набережные Челны»), if known. */
  city: string | null;
  /** «Республика Татарстан», if known. */
  region: string | null;
}

export interface PriceCell {
  /** Median of the reporters' prices, rounded to 10 ₽. */
  median: number;
  /**
   * The lowest and highest reporter's price — only with at least
   * INDEX_RANGE_MIN_REPORTERS behind the number (with 3 the median and both
   * ends would be all three prices); null otherwise.
   */
  min: number | null;
  max: number | null;
  /** Different companies/participants behind the number (≥ INDEX_MIN_REPORTERS). */
  reporters: number;
}

export type PriceScope = 'city' | 'region' | 'russia';

/** The median of a non-empty list (the mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const round10 = (value: number) => Math.round(value / 10) * 10;

/**
 * The cell of a set of prices, or null when fewer than INDEX_MIN_REPORTERS
 * different reporters stand behind them. Each reporter is one value: the
 * median of its own prices.
 */
export function priceCell(points: readonly PricePoint[]): PriceCell | null {
  const byReporter = new Map<string, number[]>();
  for (const point of points) {
    if (!(point.hourly > 0) || !Number.isFinite(point.hourly)) continue;
    const list = byReporter.get(point.reporter) ?? [];
    list.push(point.hourly);
    byReporter.set(point.reporter, list);
  }
  if (byReporter.size < INDEX_MIN_REPORTERS) return null;
  const values = [...byReporter.values()].map((list) => median(list));
  const ranged = values.length >= INDEX_RANGE_MIN_REPORTERS;
  return {
    median: round10(median(values)),
    min: ranged ? round10(Math.min(...values)) : null,
    max: ranged ? round10(Math.max(...values)) : null,
    reporters: values.length,
  };
}

const fold = (text: string | null | undefined) =>
  (text ?? '').trim().toLowerCase().replace(/ё/g, 'е');

export interface PriceIndex {
  /** Every category with enough data anywhere, Russia-wide. */
  russia: Map<string, PriceCell>;
  /** «<category>|<region>» → cell. */
  regions: Map<string, PriceCell>;
  /** «<category>|<city>» → cell. */
  cities: Map<string, PriceCell>;
}

const key = (category: string, place: string) => `${category}|${fold(place)}`;

function group(points: readonly PricePoint[], keyOf: (point: PricePoint) => string | null) {
  const groups = new Map<string, PricePoint[]>();
  for (const point of points) {
    const k = keyOf(point);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(point);
    groups.set(k, list);
  }
  const cells = new Map<string, PriceCell>();
  for (const [k, list] of groups) {
    const cell = priceCell(list);
    if (cell) cells.set(k, cell);
  }
  return cells;
}

/** The whole index: only cells with enough different reporters are kept. */
export function buildPriceIndex(points: readonly PricePoint[]): PriceIndex {
  return {
    russia: group(points, (point) => point.categorySlug),
    regions: group(points, (point) =>
      point.region ? key(point.categorySlug, point.region) : null,
    ),
    cities: group(points, (point) => (point.city ? key(point.categorySlug, point.city) : null)),
  };
}

export interface PriceLookup {
  scope: PriceScope;
  /** «в Казани»-free plain label: the city, the region or «Россия». */
  place: string;
  cell: PriceCell;
}

/**
 * The most local number with enough data for a category: the city, then its
 * region, then Russia; null when even Russia has too few. `exclude` drops
 * reporters first (the participant asking, and his company if he has one: he
 * is shown only the others).
 */
export function lookupPrice(
  points: readonly PricePoint[],
  categorySlug: string,
  place: { city?: string | null; region?: string | null },
  exclude: readonly string[] = [],
): PriceLookup | null {
  const own = points.filter(
    (point) => point.categorySlug === categorySlug && !exclude.includes(point.reporter),
  );
  if (place.city) {
    const cell = priceCell(own.filter((point) => fold(point.city) === fold(place.city)));
    if (cell) return { scope: 'city', place: place.city, cell };
  }
  if (place.region) {
    const cell = priceCell(own.filter((point) => fold(point.region) === fold(place.region)));
    if (cell) return { scope: 'region', place: place.region, cell };
  }
  const cell = priceCell(own);
  return cell ? { scope: 'russia', place: 'Россия', cell } : null;
}

/** The categories /ceny lists: the popular ones always, the rest when they have a number. */
export function indexCategories(index: PriceIndex): { slug: string; name: string }[] {
  const known = new Set(CATEGORIES.map((category) => category.slug));
  const slugs = new Set<string>(POPULAR_CATEGORY_SLUGS.filter((slug) => known.has(slug)));
  for (const slug of index.russia.keys()) if (known.has(slug)) slugs.add(slug);
  return [...slugs].map((slug) => ({ slug, name: categoryName(slug) }));
}

/** Places of one level with at least one number, with their cells by category. */
export function placesWithData(
  cells: Map<string, PriceCell>,
  points: readonly PricePoint[],
  level: 'city' | 'region',
): { place: string; cells: { slug: string; cell: PriceCell }[] }[] {
  // The spelling of a place as the data has it («Набережные Челны», not folded).
  const names = new Map<string, string>();
  for (const point of points) {
    const name = level === 'city' ? point.city : point.region;
    if (name && !names.has(fold(name))) names.set(fold(name), name);
  }
  const places = new Map<string, { slug: string; cell: PriceCell }[]>();
  for (const [k, cell] of cells) {
    const at = k.indexOf('|');
    const slug = k.slice(0, at);
    const place = names.get(k.slice(at + 1)) ?? k.slice(at + 1);
    const list = places.get(place) ?? [];
    list.push({ slug, cell });
    places.set(place, list);
  }
  return [...places]
    .map(([place, list]) => ({ place, cells: list.sort((a, b) => a.slug.localeCompare(b.slug)) }))
    .sort((a, b) => a.place.localeCompare(b.place, 'ru'));
}

/** «3 200 ₽» with a no-break space; whole roubles. */
export function rubles(value: number): string {
  return `${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0₽`;
}

/** «3 500 ₽/ч (2 800–4 500)» or, when all reporters agree, «3 500 ₽/ч». */
export function cellText(cell: PriceCell): string {
  const range =
    cell.min === null || cell.max === null || cell.min === cell.max
      ? ''
      : ` (${rubles(cell.min)}–${rubles(cell.max)})`;
  return `${rubles(cell.median)}/ч${range}`;
}

/** The sentence the survey answers with. */
export function lookupText(lookup: PriceLookup | null, category: string): string {
  if (!lookup) {
    return `Пока мало данных по виду «${category}» — вы среди первых. Как только ответят ещё несколько исполнителей, здесь появится средняя цена.`;
  }
  const where =
    lookup.scope === 'russia'
      ? 'по России'
      : lookup.scope === 'region'
        ? `по региону «${lookup.place}»`
        : `в городе ${lookup.place}`;
  return (
    `${category}, ${where}: медиана ${rubles(lookup.cell.median)}/ч с машинистом` +
    (lookup.cell.min === null || lookup.cell.max === null || lookup.cell.min === lookup.cell.max
      ? ''
      : `, обычно от ${rubles(lookup.cell.min)} до ${rubles(lookup.cell.max)}`) +
    ` — по данным ${lookup.cell.reporters} исполнителей.`
  );
}
