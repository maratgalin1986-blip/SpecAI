import { formatCoords } from '@/lib/geo';

// A work site marked by hand on the map, for places that have no address
// yet (a new plot, a field, a road). Pure helpers, no I/O.

export type MapPoint = { lat: number; lon: number };

/** Yandex Maps link with a pin, for the dispatcher. */
export function yandexMapsLink({ lat, lon }: MapPoint): string {
  return `https://yandex.ru/maps/?pt=${lon.toFixed(6)},${lat.toFixed(6)}&z=17&l=map`;
}

/** Short form for an address field (fits the 200-character limit). */
export function pointAddress(point: MapPoint): string {
  return `Точка на карте: ${formatCoords(point.lat, point.lon)}`;
}

export const POINT_LINE_PREFIX = 'Место работ (точка на карте):';

/** Line for a request message: coordinates and a link to open them. */
export function pointMessageLine(point: MapPoint): string {
  return `${POINT_LINE_PREFIX} ${formatCoords(point.lat, point.lon)} — ${yandexMapsLink(point)}`;
}

/** The lead API keeps the first 1000 characters of a message. */
export const MESSAGE_MAX = 1000;

/**
 * Replaces an earlier point line in a message, or appends one. A long message
 * is shortened instead of the point, so the coordinates always fit.
 */
export function withPointLine(message: string, point: MapPoint, max = MESSAGE_MAX): string {
  const line = pointMessageLine(point);
  const lines = message.split('\n').filter((l) => !l.startsWith(POINT_LINE_PREFIX));
  const base = lines
    .join('\n')
    .trim()
    .slice(0, Math.max(0, max - line.length - 1))
    .trimEnd();
  return base ? `${base}\n${line}` : line;
}
