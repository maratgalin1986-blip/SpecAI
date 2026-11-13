// Where the work is, as the viewer of an order may read it (REVIEW.md §1: no
// customer address to a provider before the booking is confirmed). The owner
// of the order, the house managers and the booked company (CONFIRMED and
// later, lib/bidPrivacy.ts bookedProviderSees) read the full location; every
// other provider gets the city and the distance from its base in whole
// kilometres — enough to decide whether to bid, not enough to find the site.
// Shared by GET /api/orders and GET /api/orders/[id]. Pure, unit-tested.
import { distanceKm, orderPoint } from './geo';

export interface OrderLocation {
  addressLine: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** The location as a provider without the booking sees it: city and distance. */
export interface RoughOrderLocation extends OrderLocation {
  addressLine: null;
  latitude: null;
  longitude: null;
  /** Whole kilometres from the viewer company's base; null when either is unknown. */
  distanceKm: number | null;
}

export interface LocationViewer {
  /** The customer, a house manager or the booked company with the booking confirmed. */
  full: boolean;
  /** The viewer company's base, for the distance. */
  base: { lat: number; lon: number } | null | undefined;
}

/** What a provider reads next to the city until the booking is confirmed. */
export const ADDRESS_AFTER_CONFIRM = 'Точный адрес — после подтверждения брони';

/** The city and the whole kilometres from `base`: what a viewer without the booking reads. */
export function roughLocation(
  location: OrderLocation | null | undefined,
  base: LocationViewer['base'],
): RoughOrderLocation | null {
  if (!location) return null;
  const point = orderPoint(location);
  return {
    addressLine: null,
    city: location.city,
    latitude: null,
    longitude: null,
    distanceKm: base && point ? Math.round(distanceKm(base, point)) : null,
  };
}

/** «Место работ: Елабуга · около 12 км от вашей базы. Точный адрес — после подтверждения брони.» */
export function roughPlaceLine(place: RoughOrderLocation): string {
  const city = place.city?.trim() || 'город не указан';
  const distance = place.distanceKm != null ? ` · около ${place.distanceKm} км от вашей базы` : '';
  return `Место работ: ${city}${distance}. ${ADDRESS_AFTER_CONFIRM}.`;
}

export function locationForViewer<T extends OrderLocation>(
  location: T | null | undefined,
  viewer: LocationViewer,
): T | RoughOrderLocation | null {
  if (!location) return null;
  if (viewer.full) return location;
  return roughLocation(location, viewer.base);
}

/** The company base as stored on Company (baseLat/baseLon), or null when unset. */
export function companyBase(
  company: { baseLat: number | null; baseLon: number | null } | null | undefined,
): { lat: number; lon: number } | null {
  return company && company.baseLat != null && company.baseLon != null
    ? { lat: company.baseLat, lon: company.baseLon }
    : null;
}

/** The weather's caption when the city is unknown and the address is not shown. */
export const PLACE_WITHOUT_CITY = 'Место работ';

/**
 * What the block «Погода и место работ» of an order page renders
 * (components/SiteConditions.tsx). `place` is the geocoded point with the
 * address as its label; it stays on the server for the forecast. The map with
 * the point and the address is drawn only for a viewer with `showExact`, and
 * only for a real address (a city-only place gets the weather, not the map);
 * everyone else reads the weather under the city's name.
 */
export function siteBlockView(
  location: { addressLine: string; city: string } | null,
  place: { lat: number; lon: number; label: string } | null,
  showExact: boolean,
): { map: { lat: number; lon: number; label: string } | null; weatherPlace: string } {
  const city = location?.city?.trim();
  const exact = showExact && Boolean(place && location && location.addressLine !== location.city);
  return {
    map: exact && place ? place : null,
    weatherPlace: city || (showExact && place ? place.label : PLACE_WITHOUT_CITY),
  };
}
