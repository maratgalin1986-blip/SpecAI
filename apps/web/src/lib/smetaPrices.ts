// Materials sold by СпецПласт16 with delivery: names, reserves, market
// reference prices and the markup that turns them into СпецПласт16 prices.
// Static on purpose: no scraping at runtime. Sources, URLs and dates live
// ONLY here (data and comments) for the refresh job and the freshness check;
// the client never sees them, nor any supplier, store or markup.
//
// HOW TO REFRESH A PRICE (one file, data only):
//  1. Open a publisher's own price-list page that shows a date (a concrete
//     plant, a quarry, a metal base in Набережные Челны / Татарстан) or an
//     official source.
//  2. Put the low–high range per unit, the publisher's name, the page's
//     publication date (`publishedAt`) and today's date (`checkedAt`) into
//     MATERIAL_PRICES below, with the page URL in `url` (never rendered).
//  3. The site shows a price only while `checkedAt` is at most 14 days old
//     (MAX_PRICE_AGE_DAYS), counted from the visitor's date. After that the
//     row is not priced («цену подтвердим за 15 минут») but stays in the
//     order, so re-check and bump `checkedAt` every two weeks.
//
// State on 2026-10-02: no dated price list from the last two weeks was found,
// so MATERIAL_PRICES is empty and every row shows «цену подтвердим за 15
// минут». What the research turned up (all undated, not used):
//  - бетон М300: beton-nc.ru/price 3 350–4 500 ₽/м³; beton-naberezhnye-chelny.ru/prices 8 750 ₽/м³.
//  - арматура А500С: metalloprokat-servis.ru 27 200–34 700 ₽/т; metallotorg.ru (Челябинск) 75 800 ₽/т.
//  - песок, щебень: aggregator listings per tonne (chelny.pulscen.ru, stroitaxi.ru).
//  - ФГИС ЦС (fgiscs.minstroyrf.ru) is reachable, but its quarterly regional
//    prices are older than 14 days by design, so they are not used either.

export type Material =
  | 'concrete'
  | 'rebar'
  | 'sand'
  | 'stone'
  | 'formwork'
  | 'blocks'
  | 'panels'
  | 'waterproofing'
  | 'geotextile'
  | 'pipe';

export interface MaterialSpec {
  name: string;
  unit: string;
  /** Reserve for cutting, losses and compaction, %. */
  reserve: number;
  /** Rounding step for ordering. */
  step: number;
}

export const MATERIALS: Record<Material, MaterialSpec> = {
  concrete: { name: 'Бетон М300', unit: 'м³', reserve: 5, step: 0.5 },
  rebar: { name: 'Арматура А500С Ø12', unit: 'т', reserve: 7, step: 0.1 },
  sand: { name: 'Песок строительный', unit: 'м³', reserve: 10, step: 1 },
  stone: { name: 'Щебень фр. 20–40', unit: 'м³', reserve: 10, step: 1 },
  formwork: { name: 'Доска опалубки 25 мм', unit: 'м²', reserve: 10, step: 1 },
  blocks: { name: 'Газобетонный блок D500 600×300×200', unit: 'м³', reserve: 5, step: 0.5 },
  panels: { name: 'Сэндвич-панели стеновые', unit: 'м²', reserve: 5, step: 1 },
  waterproofing: { name: 'Гидроизоляция рулонная', unit: 'м²', reserve: 10, step: 1 },
  geotextile: { name: 'Геотекстиль', unit: 'м²', reserve: 10, step: 1 },
  pipe: { name: 'Труба (по проекту)', unit: 'м', reserve: 5, step: 1 },
};

export interface PriceEntry {
  /** ₽ per material unit. */
  low: number;
  high: number;
  /** Internal only, never rendered: who published the price and where. */
  publisher: string;
  url: string;
  /** ISO dates: when the publisher dated the price, when we checked it. */
  publishedAt: string;
  checkedAt: string;
}

export type PriceTable = Partial<Record<Material, PriceEntry>>;

export const MAX_PRICE_AGE_DAYS = 14;

export const MATERIAL_PRICES: PriceTable = {};

export const PRICES_NOTE =
  'Предварительная цена, окончательную подтвердит менеджер СпецПласт16 после проверки наличия.';

/** СпецПласт16 markup on the market reference, by the order's reference subtotal. */
export const MARKUP_SMALL = 0.3;
export const MARKUP_MEDIUM = 0.27;
export const MARKUP_LARGE = 0.25;
/** From this reference subtotal, ₽, the medium markup applies… */
export const MARKUP_MEDIUM_FROM = 300_000;
/** …and above this one, the large-order markup. */
export const MARKUP_LARGE_ABOVE = 1_000_000;

/** The markup for an order whose reference subtotal is `subtotal` ₽. */
export function markupRate(subtotal: number): number {
  if (subtotal < MARKUP_MEDIUM_FROM) return MARKUP_SMALL;
  if (subtotal <= MARKUP_LARGE_ABOVE) return MARKUP_MEDIUM;
  return MARKUP_LARGE;
}

/** Rounds a unit price up: to 10 ₽ under 1 000, to 50 ₽ under 10 000, to 100 ₽ above. */
export function nicePrice(price: number): number {
  const step = price < 1000 ? 10 : price < 10_000 ? 50 : 100;
  return Math.ceil(price / step - 1e-9) * step;
}

/** The middle of the reference range. */
export const referenceMid = (entry: PriceEntry) => (entry.low + entry.high) / 2;

/** СпецПласт16 unit price: the reference midpoint plus the tiered markup, rounded up. */
export function materialPrice(entry: PriceEntry, subtotal: number): number {
  return nicePrice(referenceMid(entry) * (1 + markupRate(subtotal)));
}

/** Days between two ISO dates (or Date objects), whole days. */
export function ageDays(checkedAt: string, today: Date): number {
  const then = Date.parse(`${checkedAt.slice(0, 10)}T00:00:00Z`);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - then) / 86_400_000);
}

/** The price if it was checked at most 14 days ago, otherwise null. */
export function freshPrice(
  material: Material,
  today: Date,
  prices: PriceTable = MATERIAL_PRICES,
): PriceEntry | null {
  const entry = prices[material];
  if (!entry || !Number.isFinite(Date.parse(entry.checkedAt))) return null;
  const age = ageDays(entry.checkedAt, today);
  return age >= 0 && age <= MAX_PRICE_AGE_DAYS ? entry : null;
}
