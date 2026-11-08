// «Приём заявок» points of the platform on the customers' maps (owner,
// 2026-10-18: the map should look alive and collect orders). Honest by
// construction: a point is a big city from the shared list where no real
// provider stands nearby, labelled as the platform itself — never a company,
// a price, «на линии» or a person — and it only opens the order form with the
// city filled in. Real providers always win: a city with one near is skipped,
// and the maps hide a point once a machine on the line shows up near it.
// Pure, unit-tested.

import { RUSSIAN_CITIES } from '@specai/shared';
import { distanceKm } from './geo';
import { SITE } from './site';

/** A real provider or machine within this many kilometres hides the city's point. */
export const INTAKE_CLEAR_KM = 30;
/** The biggest cities of the list (it starts with them) are the candidates. */
export const INTAKE_CITY_POOL = 45;
/** At most this many points on a map: enough for the whole country. */
export const INTAKE_MAX = 30;

export const INTAKE_TITLE = `${SITE.platform} · приём заявок`;

export interface IntakePoint {
  /** «intake-<city>»: never an id of a company, a machine or a person. */
  id: string;
  city: string;
  lat: number;
  lon: number;
  /** «ИИСтройка24 · приём заявок». */
  title: string;
  /** «Казань: оставьте заявку — найдём технику». */
  text: string;
  /** The order form with the city in the address field. */
  href: string;
}

export function intakeHref(city: string): string {
  return `/orders?address=${encodeURIComponent(city)}#new`;
}

/**
 * The cities that get a «приём заявок» point: among the INTAKE_CITY_POOL
 * biggest, those with no `occupied` point (a provider's base, a machine on
 * the line) within `clearKm`; at most `max`, biggest first.
 */
export function intakePoints(
  occupied: readonly { lat: number; lon: number }[],
  { clearKm = INTAKE_CLEAR_KM, max = INTAKE_MAX }: { clearKm?: number; max?: number } = {},
): IntakePoint[] {
  const result: IntakePoint[] = [];
  for (const city of RUSSIAN_CITIES.slice(0, INTAKE_CITY_POOL)) {
    if (result.length >= max) break;
    if (occupied.some((point) => distanceKm(city, point) <= clearKm)) continue;
    result.push({
      id: `intake-${city.name}`,
      city: city.name,
      lat: city.lat,
      lon: city.lon,
      title: INTAKE_TITLE,
      text: `${city.name}: оставьте заявку — найдём технику`,
      href: intakeHref(city.name),
    });
  }
  return result;
}

/** The points still clear of `occupied` (machines on the line the map got later). */
export function clearOf<T extends { lat: number; lon: number }>(
  points: readonly T[],
  occupied: readonly { lat: number; lon: number }[],
  clearKm = INTAKE_CLEAR_KM,
): T[] {
  return points.filter((point) => !occupied.some((other) => distanceKm(point, other) <= clearKm));
}
