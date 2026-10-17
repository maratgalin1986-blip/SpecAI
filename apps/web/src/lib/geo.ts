// Addresses → coordinates, and the top-down map around a work site.
//
// Geocoding: Nominatim (OpenStreetMap), free with an identifying User-Agent,
// at most about one request per second and with caching — the site sends a
// handful a day and caches each address for 30 days. Map: OpenStreetMap
// tiles with the «© участники OpenStreetMap» credit shown on the map.

export type GeoPoint = { lat: number; lon: number; label: string; city?: string };

export const GEO_USER_AGENT =
  'SpecPlast16/1.0 (+https://spec-ai-web.vercel.app; specplast16@mail.ru)';

/**
 * An address lookup that tells «not found» from «the service did not answer»
 * (timeout, HTTP error, broken response): the forms say different things.
 */
export type GeocodeResult =
  { status: 'found'; place: GeoPoint } | { status: 'not_found' } | { status: 'unavailable' };

import { RUSSIAN_CITIES, cityByName, findCityInText, type RussianCity } from '@specai/shared';
import { addressVariants, namesPlace } from './addressVariants';

export const GEOCODER_UNAVAILABLE_MESSAGE =
  'Сервис поиска адресов сейчас не отвечает — попробуйте через минуту или поставьте точку на карте';

/** Where the search should look first: the phone's position or the order's city. */
export type NearPoint = { lat: number; lon: number };

export interface GeocodeOptions {
  /** Results near this point win (the user's position, a provider's base). */
  near?: NearPoint | null;
  /** The town added to a bare street («Мира 10» → «Мира 10, Казань»). */
  city?: string | null;
  /**
   * The result is stored and acted on (an order's work site, a provider's
   * base): a bare street is never guessed. Without a bias it is not looked up
   * at all; with one only a hit within NEAR_KM of it counts.
   */
  strict?: boolean;
}

/** A hit this close to the bias point is taken at once (km). */
export const NEAR_KM = 100;

/**
 * A bias point from a request: «55.74,52.39» or {lat, lon}, inside Russia,
 * rounded to 0.05° (about 5 km) — enough to pick the town, not the house, and
 * the same rounding keeps the geocoder's cache useful. Null for anything else.
 */
export function parseNear(value: unknown): NearPoint | null {
  let lat: unknown;
  let lon: unknown;
  if (typeof value === 'string') {
    const parts = value.split(',');
    if (parts.length !== 2) return null;
    [lat, lon] = parts.map((part) => (part.trim() === '' ? NaN : Number(part.trim())));
  } else if (value && typeof value === 'object') {
    ({ lat, lon } = value as { lat?: unknown; lon?: unknown });
  }
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inServiceArea(lat, lon)) return null;
  const round = (x: number) => Math.round(x * 20) / 20;
  return { lat: round(lat), lon: round(lon) };
}

/**
 * Coordinates of an address in Russia to store, or null (server side,
 * cached): the spelled-out variants of the address, a hit near `near`
 * preferred. Strict (see GeocodeOptions): «Мира 10» without a town and
 * without a bias is not placed in a random city of the same street — the
 * order's place stays unknown instead.
 */
export async function geocodeAddress(
  query: string,
  options: Omit<GeocodeOptions, 'strict'> = {},
): Promise<GeoPoint | null> {
  const result = await findAddress(query, { ...options, strict: true });
  return result.status === 'found' ? result.place : null;
}

/**
 * The lookup the forms use: every spelling of the address (addressVariants:
 * «пр-т» → «проспект», the bias city added to a bare street). Without a bias
 * the whole of Russia is searched and the first hit wins; with one, a hit
 * within NEAR_KM of it wins, else the first hit anywhere. «unavailable» stops
 * the search at once so a throttling geocoder is not hammered.
 */
export async function findAddress(
  query: string,
  options: GeocodeOptions = {},
): Promise<GeocodeResult> {
  let near = options.near ?? null;
  // A town given by the caller is a bias too: its centre.
  const given = options.city ? cityByName(options.city) : null;
  if (!near && given) near = { lat: given.lat, lon: given.lon };
  let elsewhere: GeoPoint | null = null;
  let unavailable = false;
  // All the spellings together must answer within a Vercel function's time:
  // a slow geocoder is reported as unavailable, not as a 504.
  const deadline = Date.now() + GEOCODE_BUDGET_MS;
  // An address that names its town is taken where it says, however far from
  // the bias; a bare street prefers the town around the bias point.
  const named = namesPlace(query);
  let city = options.city?.trim() || null;
  if (!city && near && !named) city = await cityNear(near, deadline);
  // A bare street to store: only a hit near the bias counts, and without a
  // bias it is not looked up at all.
  const guess = Boolean(options.strict) && !named;
  if (guess && !near) return { status: 'not_found' };
  for (const variant of addressVariants(query, city, named)) {
    if (Date.now() + GEO_TIMEOUT_MS / 2 > deadline) {
      unavailable = true;
      break;
    }
    const found = await lookupAddress(variant, near);
    if (found.status === 'unavailable') {
      unavailable = true;
      break;
    }
    if (found.status !== 'found') continue;
    if (!near || named || distanceKm(near, found.place) <= NEAR_KM) return found;
    // Far from the bias: kept as the last resort, unless it would be a guess.
    if (!guess) elsewhere ??= found.place;
  }
  if (elsewhere) return { status: 'found', place: elsewhere };
  return { status: unavailable ? 'unavailable' : 'not_found' };
}

/**
 * The town around a bias point: a known city within 30 km, else Nominatim's
 * reverse lookup at city level (cached). Null when nobody knows — the search
 * then runs without a town, only biased to the point.
 */
export async function cityNear(near: NearPoint, deadline: number): Promise<string | null> {
  const known = nearestCity(near.lat, near.lon, 30);
  if (known) return known.name;
  const left = deadline - Date.now();
  if (left < GEO_TIMEOUT_MS) return null;
  const params = new URLSearchParams({
    lat: String(near.lat),
    lon: String(near.lon),
    zoom: '10',
    format: 'jsonv2',
    'accept-language': 'ru',
  });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'User-Agent': GEO_USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(Math.min(GEO_TIMEOUT_MS, left / 2)),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      address?: { city?: string; town?: string; village?: string; country_code?: string };
    } | null;
    const address = body?.address;
    if (!address || (address.country_code && address.country_code !== 'ru')) return null;
    return address.city ?? address.town ?? address.village ?? null;
  } catch {
    return null;
  }
}

/** Nominatim's viewbox around a bias point (about 65 × 65 km): preferred, not required. */
export function viewboxAround(near: NearPoint): string {
  // Chukotka: the box must not cross ±180°.
  const lon = (value: number) => Math.max(-180, Math.min(180, value));
  return [lon(near.lon - 0.5), near.lat + 0.3, lon(near.lon + 0.5), near.lat - 0.3]
    .map((value) => value.toFixed(2))
    .join(',');
}

/**
 * A point typed or picked on the map instead of an address: «55.7431, 52.3981»
 * or «Точка на карте: 55.7431° с. ш., 52.3981° в. д.». Null for anything else.
 */
export function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const match = query.match(
    /(-?\d{1,2}\.\d{3,})°?\s*(?:с\.\s*ш\.)?\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** One geocoder request; two of them (Nominatim, then Photon) per spelling. */
export const GEO_TIMEOUT_MS = 4000;
/** All spellings of one address together (Vercel kills the function at 10 s). */
export const GEOCODE_BUDGET_MS = 8500;

/**
 * One spelling, with the reason when there is no place: Russia only, a hit
 * near `near` ranked first (Nominatim's viewbox, not bounded), Photon when
 * Nominatim does not answer.
 */
export async function lookupAddress(
  query: string,
  near: NearPoint | null = null,
): Promise<GeocodeResult> {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (q.length < 3) return { status: 'not_found' };
  // A point from the map needs no geocoder.
  const point = parseCoordinates(q);
  if (point) return { status: 'found', place: { ...point, label: 'Точка на карте' } };
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ru',
    addressdetails: '1',
    'accept-language': 'ru',
  });
  if (near) {
    params.set('viewbox', viewboxAround(near));
    params.set('bounded', '0');
  }
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': GEO_USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    });
    // Nominatim throttles a burst (429) or is down: Photon, the other free
    // OpenStreetMap geocoder, answers instead.
    if (!response.ok) return lookupPhoton(q, near);
    const hits = (await response.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: {
        road?: string;
        house_number?: string;
        suburb?: string;
        city?: string;
        town?: string;
        village?: string;
      };
    }[];
    if (!Array.isArray(hits)) return { status: 'unavailable' };
    const hit = hits[0];
    if (!hit) return { status: 'not_found' };
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: 'not_found' };
    const city = hit.address?.city ?? hit.address?.town ?? hit.address?.village;
    return {
      status: 'found',
      place: {
        lat,
        lon,
        label: addressLabel(hit.address, city) ?? shortLabel(hit.display_name ?? ''),
        city,
      },
    };
  } catch {
    return lookupPhoton(q, near);
  }
}

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    town?: string;
    village?: string;
    countrycode?: string;
    type?: string;
  };
}

/** The first Russian hit of a Photon answer as a GeoPoint, or null. */
export function parsePhoton(features: PhotonFeature[]): GeoPoint | null {
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (p.countrycode && p.countrycode !== 'RU') continue;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const city = p.city ?? p.town ?? p.village;
    const road = p.type === 'house' ? p.street : p.name;
    const label = [road ?? p.name, p.housenumber, city].filter(Boolean).join(', ');
    return { lat, lon, label: label || 'Точка на карте', city };
  }
  return null;
}

/**
 * The fallback geocoder (photon.komoot.io, OpenStreetMap data, no key): near
 * the bias point when there is one, else within Russia's box (parsePhoton
 * keeps Russian hits only).
 */
async function lookupPhoton(q: string, near: NearPoint | null): Promise<GeocodeResult> {
  const params = new URLSearchParams({ q, limit: '5' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lon));
  } else {
    const box = RUSSIA_AREAS[0];
    params.set('bbox', [box.west, box.south, box.east, box.north].join(','));
  }
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { 'User-Agent': GEO_USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    });
    if (!response.ok) return { status: 'unavailable' };
    const body = (await response.json()) as { features?: PhotonFeature[] };
    const place = parsePhoton(Array.isArray(body.features) ? body.features : []);
    return place ? { status: 'found', place } : { status: 'not_found' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * «проспект Мира, 49А, Набережные Челны» from Nominatim address details —
 * without the name of a shop or café that happens to be in the building.
 */
export function addressLabel(
  address: { road?: string; house_number?: string; city?: string } | undefined,
  city?: string,
) {
  if (!address?.road) return null;
  return [address.road, address.house_number, city].filter(Boolean).join(', ');
}

/** «49А, проспект Мира, Новый город, Набережные Челны, …» → first parts. */
export function shortLabel(displayName: string) {
  return displayName
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^\d{6}$/.test(part) && part !== 'Россия')
    .slice(0, 4)
    .join(', ');
}

export const TILE_SIZE = 256;

/** Fractional Web Mercator tile coordinates of a point. */
export function tilePosition(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

export type MapTile = { key: string; src: string; left: number; top: number };

/**
 * The tiles covering a `cols` × `rows` block around a point, positioned in
 * pixels so that the point sits at (0, 0): place them inside a container
 * whose origin is the centre of the frame.
 */
export function tilesAround(lat: number, lon: number, zoom: number, cols = 5, rows = 3): MapTile[] {
  const { x, y } = tilePosition(lat, lon, zoom);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const n = 2 ** zoom;
  const tiles: MapTile[] = [];
  for (let dy = -Math.floor(rows / 2); dy <= Math.floor(rows / 2); dy++) {
    for (let dx = -Math.floor(cols / 2); dx <= Math.floor(cols / 2); dx++) {
      const tx = (((cx + dx) % n) + n) % n;
      const ty = cy + dy;
      if (ty < 0 || ty >= n) continue;
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        // Through the site's cached proxy (app/api/tiles).
        src: `/api/tiles/${zoom}/${tx}/${ty}`,
        left: Math.round((cx + dx - x) * TILE_SIZE),
        top: Math.round((cy + dy - y) * TILE_SIZE),
      });
    }
  }
  return tiles;
}

/** «55.7399° с. ш., 52.4045° в. д.» */
export function formatCoords(lat: number, lon: number) {
  return `${lat.toFixed(4)}° с. ш., ${lon.toFixed(4)}° в. д.`;
}

// The platform serves the whole of Russia (owner, 2026-10-17). Only tiles
// over Russia are proxied, so the endpoint cannot be used to mirror the rest
// of OSM: the street map of an order shows ~12 tiles at z15–19, the maps open
// on an overview of the country (z3–4) or on the user's town. Everything is
// cached on the CDN for a week.
/** Russia, roughly: Kaliningrad to Chukotka, and Chukotka past 180°. */
export const RUSSIA_AREAS = [
  { north: 82, south: 41, west: 19, east: 180 },
  { north: 72, south: 64, west: -180, east: -168 },
] as const;
/** The main box, for the maps' bounds. */
export const SERVICE_AREA = RUSSIA_AREAS[0];
export const TILE_MIN_ZOOM = 3;
export const TILE_MAX_ZOOM = 19;

/** The country overview the maps open on when the user's place is unknown. */
export const RUSSIA_VIEW = { lat: 57, lon: 55, zoom: 3 } as const;

/** Whether a point lies in the service area: Russia (a rough box, not the border). */
export function inServiceArea(lat: number, lon: number) {
  return RUSSIA_AREAS.some(
    (area) => lat >= area.south && lat <= area.north && lon >= area.west && lon <= area.east,
  );
}

function tileLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Whether the tile proxy serves this tile (see /api/tiles). */
export function tileAllowed(z: number, x: number, y: number) {
  if (z < TILE_MIN_ZOOM || z > TILE_MAX_ZOOM) return false;
  const west = (x / 2 ** z) * 360 - 180;
  const east = ((x + 1) / 2 ** z) * 360 - 180;
  const north = tileLat(y, z);
  const south = tileLat(y + 1, z);
  return RUSSIA_AREAS.some(
    (area) => east > area.west && west < area.east && north > area.south && south < area.north,
  );
}

// ---------------------------------------------------------------------------
// Known cities (packages/shared/src/cities.ts): every Russian city of about
// 100 000 people and more, the regional capitals and the Tatarstan towns of
// the house fleet. The demand map counts an order for its own city or the
// nearest of these; a city named in a text is placed at its centre.
// ---------------------------------------------------------------------------

export interface CityPoint {
  name: string;
  lat: number;
  lon: number;
}

export const KNOWN_CITIES: readonly RussianCity[] = RUSSIAN_CITIES;

/** Great-circle distance in kilometres (the same formula as lib/notifications/routing.ts). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest city of the list within `maxKm` (default 80), else null. */
export function nearestCity(lat: number, lon: number, maxKm = 80): RussianCity | null {
  let best: RussianCity | null = null;
  let bestKm = Infinity;
  for (const city of KNOWN_CITIES) {
    const km = distanceKm({ lat, lon }, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best && bestKm <= maxKm ? best : null;
}

/**
 * The known city named in a free text (the earliest one), else null: «в
 * Казани», «Екатеринбург, ул. …». Streets named after a city («Нижнекамское
 * шоссе», «ул. Казанская») do not count (findCityInText).
 */
export function cityInText(text: string | null | undefined): RussianCity | null {
  // Addresses and stored cities: «Киров, ул. Ленина 5» names Киров.
  return findCityInText(text, { address: true })?.city ?? null;
}

/**
 * The city stored with an order's address (Location.city): the geocoder's,
 * else a known city the address names («Елабуга, …»), else empty — the place
 * is unknown. Never a default town.
 */
export function addressCity(address: string, place: { city?: string } | null): string {
  return place?.city?.trim() || cityInText(address)?.name || '';
}

/**
 * Where an order's work site is, for choosing which providers hear of it and
 * how far it is: the geocoded point; else the centre of a known city named in
 * the location (chat orders store only «Елабуга»). Null when the place is
 * unknown — no location at all, or a town we cannot place. An order is never
 * assumed to be in the house fleet's city: providerMatchesOrder then sends it
 * only to the house company and to providers whose base address names the
 * town.
 */
export function orderPoint(
  location:
    | {
        latitude?: number | null;
        longitude?: number | null;
        city?: string | null;
        addressLine?: string | null;
      }
    | null
    | undefined,
): { lat: number; lon: number } | null {
  if (location?.latitude != null && location.longitude != null) {
    return { lat: location.latitude, lon: location.longitude };
  }
  if (!location) return null;
  const city =
    cityByName(location.city) ??
    cityInText(`${location.city ?? ''}, ${location.addressLine ?? ''}`);
  return city ? { lat: city.lat, lon: city.lon } : null;
}
