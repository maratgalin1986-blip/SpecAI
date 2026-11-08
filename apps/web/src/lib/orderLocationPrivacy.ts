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

export function locationForViewer<T extends OrderLocation>(
  location: T | null | undefined,
  viewer: LocationViewer,
): T | RoughOrderLocation | null {
  if (!location) return null;
  if (viewer.full) return location;
  const point = orderPoint(location);
  return {
    addressLine: null,
    city: location.city,
    latitude: null,
    longitude: null,
    distanceKm: viewer.base && point ? Math.round(distanceKm(viewer.base, point)) : null,
  };
}

/** The company base as stored on Company (baseLat/baseLon), or null when unset. */
export function companyBase(
  company: { baseLat: number | null; baseLon: number | null } | null | undefined,
): { lat: number; lon: number } | null {
  return company && company.baseLat != null && company.baseLon != null
    ? { lat: company.baseLat, lon: company.baseLon }
    : null;
}
