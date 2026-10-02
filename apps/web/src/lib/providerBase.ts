// Where a provider's fleet is based, from what the form sent: a point picked
// on the map wins; otherwise the address is geocoded (Nominatim, cached).
// Server only (it calls geocodeAddress); the checks themselves live in
// providerMap.ts and are unit-tested there.

import { GEOCODER_UNAVAILABLE_MESSAGE, inServiceArea, lookupAddress } from './geo';
import {
  BASE_OUTSIDE_MESSAGE,
  BASE_REQUIRED_MESSAGE,
  hasCoords,
  parseBaseCoords,
} from './providerMap';

export const BASE_NOT_FOUND_MESSAGE =
  'Адрес базы не найден — уточните город, улицу и дом или поставьте точку на карте';

/** baseAddress is left out when the request had no address key: the saved one stays. */
export type ProviderBase = { baseLat: number; baseLon: number; baseAddress?: string | null };

export type ProviderBaseResult =
  { ok: true; value: ProviderBase } | { ok: false; error: string; status?: number };

function cleanAddress(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

export async function resolveProviderBase(input: {
  baseAddress?: unknown;
  baseLat?: unknown;
  baseLon?: unknown;
}): Promise<ProviderBaseResult> {
  const hasAddressKey = input.baseAddress !== undefined;
  const address = cleanAddress(input.baseAddress);
  if (hasCoords(input.baseLat, input.baseLon)) {
    const point = parseBaseCoords(input.baseLat, input.baseLon);
    if (!point.ok) return point;
    return {
      ok: true,
      value: {
        baseLat: point.value.lat,
        baseLon: point.value.lon,
        ...(hasAddressKey ? { baseAddress: address || null } : {}),
      },
    };
  }
  if (address.length < 3) return { ok: false, error: BASE_REQUIRED_MESSAGE };
  const found = await lookupAddress(address);
  if (found.status === 'unavailable') {
    return { ok: false, error: GEOCODER_UNAVAILABLE_MESSAGE, status: 503 };
  }
  if (found.status === 'not_found') return { ok: false, error: BASE_NOT_FOUND_MESSAGE };
  const place = found.place;
  if (!inServiceArea(place.lat, place.lon)) return { ok: false, error: BASE_OUTSIDE_MESSAGE };
  const point = parseBaseCoords(place.lat, place.lon);
  if (!point.ok) return point;
  return {
    ok: true,
    value: { baseLat: point.value.lat, baseLon: point.value.lon, baseAddress: address },
  };
}
