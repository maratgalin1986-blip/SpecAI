// Addresses → coordinates, and the top-down map around a work site.
//
// Geocoding: Nominatim (OpenStreetMap), free with an identifying User-Agent,
// at most about one request per second and with caching — the site sends a
// handful a day and caches each address for 30 days. Map: OpenStreetMap
// tiles with the «© участники OpenStreetMap» credit shown on the map.

export type GeoPoint = { lat: number; lon: number; label: string; city?: string };

export const GEO_USER_AGENT =
  'SpecPlast16/1.0 (+https://spec-ai-web.vercel.app; specplast16@mail.ru)';

// Naberezhnye Chelny and around (Elabuga, Nizhnekamsk, Menzelinsk):
// preferred, not required, so an address elsewhere is still found.
const VIEWBOX = '51.2,56.2,53.4,55.3';

/**
 * An address lookup that tells «not found» from «the service did not answer»
 * (timeout, HTTP error, broken response): the forms say different things.
 */
export type GeocodeResult =
  { status: 'found'; place: GeoPoint } | { status: 'not_found' } | { status: 'unavailable' };

export const GEOCODER_UNAVAILABLE_MESSAGE =
  'Сервис поиска адресов сейчас не отвечает — попробуйте через минуту или поставьте точку на карте';

/** Coordinates of an address in Russia, or null (server side, cached). */
export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const result = await lookupAddress(query);
  return result.status === 'found' ? result.place : null;
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

/** Like geocodeAddress, with the reason when there is no place. */
export async function lookupAddress(query: string): Promise<GeocodeResult> {
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
    viewbox: VIEWBOX,
    bounded: '0',
  });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': GEO_USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { status: 'unavailable' };
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

// Only tiles around Tatarstan and neighbours are proxied, so the endpoint
// cannot be used to mirror OSM: the street map of an order shows ~12 tiles at
// z15–19, the providers map (/map) starts with an overview of the republic
// (z6–8) and zooms in. Everything is cached on the CDN for a week.
export const SERVICE_AREA = { north: 57.5, south: 53, west: 45, east: 56 } as const;
const AREA = SERVICE_AREA;
export const TILE_MIN_ZOOM = 6;
export const TILE_MAX_ZOOM = 19;

/** Whether a point lies in the service area (Tatarstan and neighbouring regions). */
export function inServiceArea(lat: number, lon: number) {
  return lat >= AREA.south && lat <= AREA.north && lon >= AREA.west && lon <= AREA.east;
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
  return east > AREA.west && west < AREA.east && north > AREA.south && south < AREA.north;
}
