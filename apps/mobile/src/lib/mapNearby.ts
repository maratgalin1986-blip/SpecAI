import type { LiveMarker } from './line';
import { distanceKm } from './orderFlow';
import {
  HOUSE_LABEL,
  machinesLabel,
  pinMachinesText,
  type CustomerPin,
  type ProviderPin,
} from './providersMap';

/**
 * «Кто рядом» (владелец, 2026-11-08): нажатие на значок карты центрирует её
 * и показывает ближайшие значки с расстоянием, именем и техникой. Точки —
 * те же публичные значки, что уже на карте (исполнители, заявки «Заказчик
 * рядом», машины на линии): ничего нового с сервера здесь не уходит. Как
 * apps/web/src/lib/mapNearby.ts на сайте.
 */
export interface NearbyPoint {
  /** «provider:<id>», «customer:<id>», «live:<id>» — ключ значка на странице карты. */
  key: string;
  lat: number;
  lon: number;
  /** Имя: компания, «Заказчик рядом», машина на линии. */
  title: string;
  /** Техника: виды техники исполнителя, что нужно заказчику, цена машины. */
  sub: string;
}

export interface NearbyItem extends NearbyPoint {
  distanceKm: number;
  /** «рядом», «1,2 км», «48 км». */
  distance: string;
}

/** В карточке значка — не больше стольких соседей. */
export const NEARBY_LIST_MAX = 5;
/** Дальше — уже не «рядом», даже в пустом регионе. */
export const NEARBY_LIST_KM = 300;

/** «рядом» до 300 м, «1,2 км» до 10 км, дальше «48 км». */
export function distanceText(km: number): string {
  if (km < 0.3) return 'рядом';
  if (km < 10) return `${km.toFixed(1).replace('.', ',')}\u00a0км`;
  return `${Math.round(km)}\u00a0км`;
}

const samePlace = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005;

/**
 * Все значки карты одним списком. Точка СпецПласт16, на месте которой стоит
 * значок «N машин на линии», в список не идёт: на карте она скрыта под ним.
 */
export function nearbyPoints(
  pins: readonly ProviderPin[],
  customers: readonly CustomerPin[],
  live: readonly LiveMarker[],
): NearbyPoint[] {
  const houseGroups = live.filter((marker) => marker.house && (marker.items?.length ?? 0) > 1);
  const points: NearbyPoint[] = [];
  for (const marker of live) {
    points.push({
      key: marker.key,
      lat: marker.lat,
      lon: marker.lon,
      title: marker.items ? (marker.title ?? marker.body) : marker.body || marker.head,
      sub: marker.items ? '' : marker.head,
    });
  }
  for (const pin of pins) {
    if (pin.isHouse && houseGroups.some((group) => samePlace(group, pin))) continue;
    points.push({
      key: `provider:${pin.id}`,
      lat: pin.lat,
      lon: pin.lon,
      title: pin.isHouse ? HOUSE_LABEL : pin.name.replace(/\s+/g, ' ').trim(),
      sub: pinMachinesText(pin) ?? machinesLabel(pin.equipmentCount),
    });
  }
  for (const customer of customers) {
    points.push({
      key: `customer:${customer.id}`,
      lat: customer.lat,
      lon: customer.lon,
      title: customer.title,
      sub: customer.machinery ? `нужно: ${customer.machinery}` : customer.sub,
    });
  }
  return points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

/** Ближайшие к значку `key` (сам он не в счёт): сначала ближние, не дальше maxKm. */
export function nearbyAround(
  key: string,
  points: readonly NearbyPoint[],
  options: { limit?: number; maxKm?: number } = {},
): NearbyItem[] {
  const centre = points.find((point) => point.key === key);
  if (!centre) return [];
  const limit = options.limit ?? NEARBY_LIST_MAX;
  const maxKm = options.maxKm ?? NEARBY_LIST_KM;
  const items: NearbyItem[] = [];
  for (const point of points) {
    if (point.key === key) continue;
    const km = distanceKm(centre, point);
    if (km > maxKm) continue;
    items.push({ ...point, distanceKm: Math.round(km * 10) / 10, distance: distanceText(km) });
  }
  return items.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}
