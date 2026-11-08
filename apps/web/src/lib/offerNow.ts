// «Заказать технику» (owner, 2026-10-18: «мою технику первым делом предлагай,
// а потом всех остальных, кто на линии»): above the order forms, first
// СпецПласт16's free machines with their prices, then the other providers'
// machines on the line right now. Only real rows (lib/lineNearbyData.ts); with
// nobody on the line the block says so. Pure, unit-tested.
//
// The block is public (guests see it), while the map of machines on the line
// (GET /api/line/nearby) is for accounts: so a card of a machine on the line
// carries only the machine, its customer price and the nearest big city —
// never the driver's name, the company, the phone's position or any id but the
// machine's own (its public page).

import type { BaseMachine, LiveMachine } from './linePresence';
import { rateText } from './linePresence';
import { nearestCity } from './geo';
import { SITE } from './site';

/** How many machines each list shows: compact on a phone. */
export const OFFER_HOUSE_MAX = 6;
export const OFFER_LINE_MAX = 6;
/**
 * How many machines on the line go to the page: the browser shows the
 * OFFER_LINE_MAX nearest to the visitor when it knows where they are.
 */
export const OFFER_LINE_POOL = 60;
/**
 * СпецПласт16 leads the block where it serves: a visitor known to be farther
 * than this from every house machine sees the machines on the line first.
 */
export const HOUSE_SERVES_KM = 300;

export const NOBODY_ON_LINE =
  'Сейчас на линии никого — оставьте заявку, исполнители рядом пришлют цены';

export interface OfferCard {
  /** The machine's id: «Подробнее» goes to its public page. */
  id: string;
  name: string;
  category: string | null;
  categorySlug: string | null;
  /** «от 2 500 ₽/ч» or «цена договорная». */
  price: string;
  /** «СпецПласт16» for the house fleet; null on the line (no names in public). */
  who: string | null;
  /** Whether the machine is on the line now (its driver went online). */
  live: boolean;
  /** The nearest big city (within 80 km), for «на линии · Казань»; null when none. */
  city: string | null;
  /**
   * A public point to sort by distance: the city's centre for a machine on the
   * line, the base (as on the public map) for a house machine at the base;
   * null when unknown.
   */
  near: { lat: number; lon: number } | null;
  /** The line a «Заказать» puts into the form. */
  prefill: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function prefillLine(name: string, price: string, where: string): string {
  return `Нужна: ${name} (${where}, ${price}).`;
}

/**
 * The two lists: СпецПласт16's machines (on the line first, then at the
 * base) and the other providers' machines on the line, freshest first.
 */
export function offerCards(
  machines: readonly LiveMachine[],
  base: readonly BaseMachine[],
): { house: OfferCard[]; line: OfferCard[] } {
  const fromLive = (machine: LiveMachine): OfferCard | null => {
    if (!machine.equipment) return null;
    const price = rateText(machine.equipment.hourlyRate);
    const house = machine.company.isHouse;
    const city = nearestCity(machine.lat, machine.lon);
    return {
      id: machine.equipment.id,
      name: machine.equipment.name,
      category: machine.equipment.category,
      categorySlug: machine.equipment.categorySlug,
      price,
      who: house ? SITE.name : null,
      live: true,
      city: city?.name ?? null,
      // Never the phone's own position: the city's centre.
      near: city ? { lat: city.lat, lon: city.lon } : null,
      prefill: prefillLine(
        machine.equipment.name,
        price,
        house ? `${SITE.name}, на линии` : 'на линии',
      ),
    };
  };
  const live = machines.map(fromLive).filter((card): card is OfferCard => card !== null);
  const atBase: OfferCard[] = base.map((machine) => ({
    id: machine.equipment.id,
    name: machine.equipment.name,
    category: machine.equipment.category,
    categorySlug: machine.equipment.categorySlug,
    price: machine.priceText,
    who: SITE.name,
    live: false,
    city: nearestCity(machine.lat, machine.lon)?.name ?? null,
    near: { lat: round2(machine.lat), lon: round2(machine.lon) },
    prefill: prefillLine(machine.equipment.name, machine.priceText, SITE.name),
  }));
  const houseIds = new Set(
    machines.filter((m) => m.company.isHouse).flatMap((m) => m.equipment?.id ?? []),
  );
  return {
    house: [...live.filter((card) => houseIds.has(card.id)), ...atBase].slice(0, OFFER_HOUSE_MAX),
    line: live.filter((card) => !houseIds.has(card.id)).slice(0, OFFER_LINE_POOL),
  };
}
