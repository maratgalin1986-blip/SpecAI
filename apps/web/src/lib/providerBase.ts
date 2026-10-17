// Where a provider's fleet is based, from what the form sent: a point picked
// on the map wins; otherwise the address is geocoded (Nominatim, cached).
// Server only (it calls the geocoder); the checks themselves live in
// providerMap.ts and are unit-tested there.

import { GEOCODER_UNAVAILABLE_MESSAGE, findAddress, parseNear } from './geo';
import { namesPlace } from './addressVariants';
import { BASE_REQUIRED_MESSAGE, hasCoords, parseBaseCoords } from './providerMap';

export const BASE_NOT_FOUND_MESSAGE =
  'Адрес базы не найден — уточните город, улицу и дом или поставьте точку на карте';

/**
 * A street without a town matches streets of the same name all over Russia:
 * the base would land in another city. With no position of the phone to tell
 * the town, the provider is asked for it.
 */
export const BASE_CITY_MESSAGE =
  'Укажите в адресе базы город, например «Казань, ул. Баумана, 1», или поставьте точку на карте';

/** baseAddress is left out when the request had no address key: the saved one stays. */
export type ProviderBase = { baseLat: number; baseLon: number; baseAddress?: string | null };

export type ProviderBaseResult =
  { ok: true; value: ProviderBase } | { ok: false; error: string; status?: number };

function cleanAddress(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

export { addressVariants } from './addressVariants';

export async function resolveProviderBase(input: {
  baseAddress?: unknown;
  baseLat?: unknown;
  baseLon?: unknown;
  /** The phone's position («lat,lon» or {lat, lon}): the town of a bare street. */
  near?: unknown;
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
  const near = parseNear(input.near);
  const named = namesPlace(address);
  if (!near && !named) return { ok: false, error: BASE_CITY_MESSAGE };
  // The whole of Russia for an address with its town; a bare street only
  // around the phone (strict: a namesake far away is not taken).
  const found = await findAddress(address, { near, strict: true });
  if (found.status === 'unavailable') {
    return { ok: false, error: GEOCODER_UNAVAILABLE_MESSAGE, status: 503 };
  }
  if (found.status === 'not_found') {
    return { ok: false, error: named ? BASE_NOT_FOUND_MESSAGE : BASE_CITY_MESSAGE };
  }
  const point = parseBaseCoords(found.place.lat, found.place.lon);
  if (!point.ok) return point;
  return {
    ok: true,
    value: { baseLat: point.value.lat, baseLon: point.value.lon, baseAddress: address },
  };
}
