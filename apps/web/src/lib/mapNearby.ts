// «При выборе заказчика или исполнителя — видно вокруг него, кто рядом»
// (owner, 2026-11-08): a tap on a pin centres the map and lists the nearest
// others by distance, with one line that sums them up («рядом: 3 экскаватора,
// 2 самосвала, 1 заказчик»). Pure, unit-tested; the points are the public
// pins the map already shows (lib/providerMap.ts, lib/mapCustomers.ts and
// the machines on the line), so nothing new leaves the server here.

import { distanceKm } from './geo';
import { pluralizeRu } from './pluralize';

export type NearbyKind = 'provider' | 'customer' | 'live';

export interface NearbyPoint {
  kind: NearbyKind;
  id: string;
  lat: number;
  lon: number;
  /** The bold line: the company, «Заказчик рядом», the machine on the line. */
  title: string;
  /** The small line: machinery types, the city, the price. */
  sub: string;
  href: string;
  /** Machinery types for the summary («Экскаваторы», «Самосвалы»). */
  types: readonly string[];
}

export interface NearbyItem extends NearbyPoint {
  distanceKm: number;
  /** «1,2 км», «48 км». */
  distanceText: string;
}

/** The list under the map shows at most this many neighbours. */
export const NEARBY_LIST_MAX = 8;
/** Farther than this is not «рядом» even in an empty region. */
export const NEARBY_LIST_KM = 300;

/** «рядом» under 300 m, «1,2 км» under 10 km, «48 км» beyond. */
export function distanceText(km: number): string {
  if (km < 0.3) return 'рядом';
  if (km < 10) return `${km.toFixed(1).replace('.', ',')}\u00a0км`;
  return `${Math.round(km)}\u00a0км`;
}

/** One key per pin, so a provider and an order with the same id never collide. */
export function nearbyKey(point: Pick<NearbyPoint, 'kind' | 'id'>): string {
  return `${point.kind}:${point.id}`;
}

/**
 * The points nearest to `centre` (the tapped pin itself left out by its
 * nearbyKey), nearest first, at most `limit` within `maxKm`.
 */
export function nearbyAround(
  centre: { lat: number; lon: number },
  points: readonly NearbyPoint[],
  options: { exclude?: string | null; limit?: number; maxKm?: number } = {},
): NearbyItem[] {
  const limit = options.limit ?? NEARBY_LIST_MAX;
  const maxKm = options.maxKm ?? NEARBY_LIST_KM;
  const items: NearbyItem[] = [];
  for (const point of points) {
    if (options.exclude && nearbyKey(point) === options.exclude) continue;
    const km = distanceKm(centre, point);
    if (km > maxKm) continue;
    items.push({ ...point, distanceKm: Math.round(km * 10) / 10, distanceText: distanceText(km) });
  }
  return items.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

/**
 * Plural forms of the common machinery types for the summary line; a type
 * not listed is counted as «N × Тип» so nothing is invented.
 */
const TYPE_FORMS: [RegExp, [string, string, string]][] = [
  [
    /экскаватор[\s-]*погрузчик/i,
    ['экскаватор-погрузчик', 'экскаватора-погрузчика', 'экскаваторов-погрузчиков'],
  ],
  [/мини[\s-]*экскаватор/i, ['мини-экскаватор', 'мини-экскаватора', 'мини-экскаваторов']],
  [/экскаватор/i, ['экскаватор', 'экскаватора', 'экскаваторов']],
  [/самосвал/i, ['самосвал', 'самосвала', 'самосвалов']],
  [/манипулятор|кму/i, ['манипулятор', 'манипулятора', 'манипуляторов']],
  [/автокран|\bкран/i, ['автокран', 'автокрана', 'автокранов']],
  [/автовышк|вышк|подъ[её]мник|агп/i, ['автовышка', 'автовышки', 'автовышек']],
  [/фронтальн|погрузчик/i, ['погрузчик', 'погрузчика', 'погрузчиков']],
  [/бульдозер/i, ['бульдозер', 'бульдозера', 'бульдозеров']],
  [/грейдер/i, ['грейдер', 'грейдера', 'грейдеров']],
  [/каток/i, ['каток', 'катка', 'катков']],
  [/трал|низкорамн/i, ['трал', 'трала', 'тралов']],
  [/ямобур|бурильн/i, ['ямобур', 'ямобура', 'ямобуров']],
  [/бетононасос/i, ['бетононасос', 'бетононасоса', 'бетононасосов']],
  [/миксер|бетоносмесител|автобетоносмесител/i, ['миксер', 'миксера', 'миксеров']],
  [/эвакуатор/i, ['эвакуатор', 'эвакуатора', 'эвакуаторов']],
  [/гидромолот/i, ['гидромолот', 'гидромолота', 'гидромолотов']],
  [/трактор/i, ['трактор', 'трактора', 'тракторов']],
];

/** «3 экскаватора», «1 автовышка», or «2 × Тип» for a type without forms. */
export function typeCountText(type: string, count: number): string {
  const forms = TYPE_FORMS.find(([pattern]) => pattern.test(type))?.[1];
  return forms ? pluralizeRu(count, forms) : `${count} × ${type}`;
}

/** The summary's first line names at most this many machinery types. */
export const SUMMARY_TYPES_MAX = 3;

/**
 * «рядом: 3 экскаватора, 2 самосвала, 1 заказчик». A machine type is
 * counted once per provider that has it (the pin knows types, not units);
 * a machine on the line counts as its type; customers are counted apart.
 * «рядом пока никого» for an empty list.
 */
export function nearbySummary(items: readonly NearbyItem[]): string {
  // «Экскаваторы» and «Гусеничные экскаваторы» are one line: the same forms.
  const keyOf = (type: string) => {
    const index = TYPE_FORMS.findIndex(([pattern]) => pattern.test(type));
    return index >= 0 ? `forms:${index}` : type.toLowerCase();
  };
  const counts = new Map<string, { type: string; count: number }>();
  let customers = 0;
  for (const item of items) {
    if (item.kind === 'customer') {
      customers += 1;
      continue;
    }
    for (const type of item.types) {
      const key = keyOf(type);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { type, count: 1 });
    }
  }
  const parts = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, 'ru'))
    .slice(0, SUMMARY_TYPES_MAX)
    .map(({ type, count }) => typeCountText(type, count));
  if (customers > 0) parts.push(pluralizeRu(customers, ['заказчик', 'заказчика', 'заказчиков']));
  if (parts.length === 0) {
    return items.length === 0
      ? 'рядом пока никого'
      : `рядом: ${pluralizeRu(items.length, ['исполнитель', 'исполнителя', 'исполнителей'])}`;
  }
  return `рядом: ${parts.join(', ')}`;
}
