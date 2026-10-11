// Demand indicator and demand map («индекс спроса» from Yandex Taxi, see
// docs/yandex-taxi-research.md): orders of the last 14 days grouped by
// machine category and by district (the order's city or the nearest of the
// Tatarstan cities in lib/geo.ts), compared with the free machines of that
// category → низкий / средний / высокий. Pure, unit-tested; GET /api/demand
// loads the rows.
import { TATARSTAN_CITIES, distanceKm, nearestCity, type CityPoint } from './geo';

export const DEMAND_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export type DemandLevel = 'low' | 'medium' | 'high';

export const DEMAND_LABELS: Record<DemandLevel, string> = {
  low: 'низкий',
  medium: 'средний',
  high: 'высокий',
};

/** Map colours of the levels (the web layer and the app share them). */
export const DEMAND_COLORS: Record<DemandLevel, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

export interface DemandOrder {
  categoryId: string | null;
  categoryName?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  createdAt: Date;
  desiredStartDate: Date;
}

/** A free machine (status AVAILABLE) with its category and, if known, its base. */
export interface DemandSupply {
  categoryId: string;
  lat?: number | null;
  lon?: number | null;
}

export interface CategoryDemand {
  categoryId: string;
  name: string;
  orders: number;
  /** Orders that start tomorrow or later (preorders still to be served). */
  upcoming: number;
  supply: number;
  level: DemandLevel;
}

export interface CityDemand {
  city: string;
  lat: number;
  lon: number;
  orders: number;
  supply: number;
  level: DemandLevel;
  /** The category most asked for in this city, if any. */
  topCategory: string | null;
}

export interface DemandSummary {
  since: string;
  categories: CategoryDemand[];
  cities: CityDemand[];
}

/**
 * The level from how many orders a fortnight brought per free machine:
 * no orders — low; a machine per order or less — high; in between — medium.
 */
export function demandLevel(orders: number, supply: number): DemandLevel {
  if (orders <= 0) return 'low';
  const pressure = orders / Math.max(1, supply);
  if (pressure >= 1) return 'high';
  if (pressure >= 0.34) return 'medium';
  return 'low';
}

/** Name of the fixed city an order belongs to, or null when nothing is known. */
export function orderCity(order: {
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
}): CityPoint | null {
  const byName = order.city
    ? TATARSTAN_CITIES.find((city) => city.name.toLowerCase() === order.city!.trim().toLowerCase())
    : undefined;
  if (byName) return byName;
  if (order.lat != null && order.lon != null) return nearestCity(order.lat, order.lon);
  return null;
}

/** Machines count for a city when their base is within 60 km of it. */
const SUPPLY_RADIUS_KM = 60;

export function demandSummary(
  orders: DemandOrder[],
  supply: DemandSupply[],
  now: Date = new Date(),
): DemandSummary {
  const since = new Date(now.getTime() - DEMAND_WINDOW_DAYS * DAY_MS);
  const recent = orders.filter((order) => order.createdAt.getTime() >= since.getTime());
  const tomorrow = new Date(now.getTime() + DAY_MS);

  const byCategory = new Map<string, CategoryDemand>();
  for (const order of recent) {
    if (!order.categoryId) continue;
    const row = byCategory.get(order.categoryId) ?? {
      categoryId: order.categoryId,
      name: order.categoryName ?? 'Техника',
      orders: 0,
      upcoming: 0,
      supply: 0,
      level: 'low' as DemandLevel,
    };
    row.orders += 1;
    if (order.desiredStartDate.getTime() >= tomorrow.getTime()) row.upcoming += 1;
    byCategory.set(order.categoryId, row);
  }
  for (const machine of supply) {
    const row = byCategory.get(machine.categoryId);
    if (row) row.supply += 1;
  }
  const categories = [...byCategory.values()]
    .map((row) => ({ ...row, level: demandLevel(row.orders, row.supply) }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'ru'));

  const byCity = new Map<string, CityDemand & { categories: Map<string, number> }>();
  for (const order of recent) {
    const city = orderCity(order);
    if (!city) continue;
    const row = byCity.get(city.name) ?? {
      city: city.name,
      lat: city.lat,
      lon: city.lon,
      orders: 0,
      supply: 0,
      level: 'low' as DemandLevel,
      topCategory: null,
      categories: new Map<string, number>(),
    };
    row.orders += 1;
    if (order.categoryName) {
      row.categories.set(order.categoryName, (row.categories.get(order.categoryName) ?? 0) + 1);
    }
    byCity.set(city.name, row);
  }
  for (const machine of supply) {
    if (machine.lat == null || machine.lon == null) continue;
    for (const row of byCity.values()) {
      if (distanceKm(row, { lat: machine.lat, lon: machine.lon }) <= SUPPLY_RADIUS_KM) {
        row.supply += 1;
      }
    }
  }
  const cities = [...byCity.values()]
    .map(({ categories: cats, ...row }) => {
      const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...row, level: demandLevel(row.orders, row.supply), topCategory: top?.[0] ?? null };
    })
    .sort((a, b) => b.orders - a.orders || a.city.localeCompare(b.city, 'ru'));

  return { since: since.toISOString(), categories, cities };
}

/**
 * The customer's hint for the chosen machine type: whether to book ahead.
 * Unknown category (no orders yet) reads as plenty of free machines.
 */
export function customerDemandText(level: DemandLevel | null, categoryName?: string | null) {
  const what = categoryName ? categoryName.toLowerCase() : 'техники';
  switch (level) {
    case 'high':
      return `Свободных машин мало (${what}) — укажите дату заранее`;
    case 'medium':
      return `Спрос на ${what} средний — лучше указать дату заранее`;
    default:
      return `Сейчас много свободных машин: ${what}`;
  }
}

/**
 * The provider's «Спрос» card: the busiest category and the city where it is
 * wanted. Null when the fortnight brought no orders.
 */
export function providerDemandText(summary: DemandSummary): string | null {
  const top = summary.categories[0];
  if (!top) return null;
  const city = summary.cities.find((row) => row.topCategory === top.name) ?? summary.cities[0];
  const where = city ? ` в городе ${city.city}` : '';
  const tail =
    top.level === 'high'
      ? 'свободных мало — цены выше'
      : top.level === 'medium'
        ? 'спрос средний'
        : 'свободных хватает';
  const when = top.upcoming > 0 ? 'На завтра и позже' : 'За две недели';
  return `${when}: ${top.name.toLowerCase()}${where} — ${tail} (${top.orders} ${pluralOrders(top.orders)}, свободных машин: ${top.supply})`;
}

function pluralOrders(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заявка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'заявки';
  return 'заявок';
}
