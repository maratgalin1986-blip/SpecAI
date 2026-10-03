import type { MachineType } from '@/lib/machinePhotos';

// The owner's hourly prices with an operator, ₽/h — the single source for the
// whole site (catalogue cards, FAQ, landings, wizard, estimate, /stroyka,
// structured data). Raised by +1000 on 2026-10-02 at the owner's request.
// The database copy of these rates is set by
// packages/database/prisma/ensure-fleet.ts (another package): keep it in step.

/** A shift is 8 hours. */
export const SHIFT_HOURS = 8;

/** Most machines. */
export const DEFAULT_RATE = 4000;

export const RATES: Record<MachineType, number> = {
  backhoe: DEFAULT_RATE,
  excavator: DEFAULT_RATE,
  'wheeled-excavator': DEFAULT_RATE,
  kmu: DEFAULT_RATE,
  agp: 3500,
  roller: DEFAULT_RATE,
  // The 25 t crane; the 32 t crane is CRANE_HEAVY_RATE.
  crane: 4500,
  loader: DEFAULT_RATE,
  truck: 3300,
  dozer: DEFAULT_RATE,
  tractor: 3500,
  trench: DEFAULT_RATE,
};

/** Work with the hydraulic hammer (backhoe, wheeled excavator). */
export const HAMMER_RATE = 4500;

/** The 32 t crane, for heavy lifts. */
export const CRANE_HEAVY_RATE = 5500;

/** The lowest hourly price on the site (the dump truck). */
export const MIN_RATE = Math.min(...Object.values(RATES));

export function rateOf(type: MachineType | null): number {
  return (type && RATES[type]) || DEFAULT_RATE;
}

/**
 * The hourly price of a house machine shown on a card: the database rate, but
 * never below the site price list (a stale or not yet repriced row must not
 * undercut lib/prices.ts). A higher row (the 32 t crane) keeps its own price.
 */
export function houseRate(
  dbRate: number | string | { toString(): string } | null | undefined,
  type: MachineType | null,
): number {
  const db = dbRate === null || dbRate === undefined ? 0 : Number(dbRate.toString());
  return Math.max(Number.isFinite(db) ? db : 0, rateOf(type));
}

/**
 * 4000 → «4 000» with a no-break space, the same as toLocaleString('ru-RU')
 * but independent of the runtime's locale data (server and browser agree).
 */
export function rub(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** «4 000 ₽/ч» for a machine type or a rate. */
export function price(typeOrRate: MachineType | number): string {
  const rate = typeof typeOrRate === 'number' ? typeOrRate : rateOf(typeOrRate);
  return `${rub(rate)} ₽/ч`;
}

/** «от 4 000 ₽/ч» for a machine type or a rate. */
export function fromPrice(typeOrRate: MachineType | number): string {
  return `от ${price(typeOrRate)}`;
}

/**
 * The price list as the FAQ reads it: machines that share a price are named
 * together (prices.test.ts checks that they really do).
 */
export const PRICE_GROUPS: { names: string; types: MachineType[]; rate: number }[] = [
  {
    names:
      'Экскаватор-погрузчик, фронтальный погрузчик, гусеничный и колёсный экскаватор, манипулятор КМУ, бульдозер и каток',
    types: ['backhoe', 'loader', 'excavator', 'wheeled-excavator', 'kmu', 'dozer', 'roller'],
    rate: RATES.backhoe,
  },
  { names: 'с гидромолотом', types: [], rate: HAMMER_RATE },
  { names: 'автокран', types: ['crane'], rate: RATES.crane },
  { names: 'автокран 32 т', types: [], rate: CRANE_HEAVY_RATE },
  { names: 'трактор и автовышка', types: ['tractor', 'agp'], rate: RATES.tractor },
  { names: 'самосвал', types: ['truck'], rate: RATES.truck },
];

/** «Сколько стоит аренда?»: every price from RATES. */
export function priceFaqAnswer(): string {
  const list = PRICE_GROUPS.map((g) => `${g.names} — ${fromPrice(g.rate)}`).join(', ');
  return `${list}. Все цены — с машинистом, смена ${SHIFT_HOURS} часов.`;
}
