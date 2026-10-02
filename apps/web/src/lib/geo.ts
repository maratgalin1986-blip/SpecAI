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

/** Coordinates of an address in Russia, or null (server side, cached). */
export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (q.length < 3) return null;
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
    if (!response.ok) return null;
    const [hit] = (await response.json()) as {
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
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const city = hit.address?.city ?? hit.address?.town ?? hit.address?.village;
    return {
      lat,
      lon,
      label: addressLabel(hit.address, city) ?? shortLabel(hit.display_name),
      city,
    };
  } catch {
    return null;
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

// Only street-level tiles around Tatarstan and neighbours are proxied, so the
// endpoint cannot be used to mirror OSM (the map shows ~12 tiles at z15–19).
const AREA = { north: 57.5, south: 53, west: 45, east: 56 };

function tileLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Whether the tile proxy serves this tile (see /api/tiles). */
export function tileAllowed(z: number, x: number, y: number) {
  if (z < 14 || z > 19) return false;
  const west = (x / 2 ** z) * 360 - 180;
  const east = ((x + 1) / 2 ** z) * 360 - 180;
  const north = tileLat(y, z);
  const south = tileLat(y + 1, z);
  return east > AREA.west && west < AREA.east && north > AREA.south && south < AREA.north;
}
