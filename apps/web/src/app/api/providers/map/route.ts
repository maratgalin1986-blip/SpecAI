import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { intakePoints } from '@/lib/intakePoints';
import { MAP_PINS_LIMIT, parseBbox } from '@/lib/providerMap';
import { loadMapPins, type MapPins } from '@/lib/providerMapData';

// Public: everyone on the customers' map (/map; owner, 2026-11-08: «все всех
// всегда должны видеть на карте в режиме офлайн и навсегда»).
// `providers`: every provider with published machinery and a point, online or
// not — name, point, marker picture, note, machinery types, city, the cheapest
// shift price, and its contact phone while its own switch is on
// (lib/providerMap.ts). No e-mails, no addresses, no registration dates.
// `customers`: open orders with a place as «Заказчик рядом» pins — the short
// name and the order's link only, at a point rounded to a kilometre
// (lib/mapCustomers.ts). `intake`: the platform's «приём заявок» points in big
// cities with no provider near (lib/intakePoints.ts).
//
// Viewport: ?bbox=south,west,north,east (the map's view), ?lat&lon (what the
// nearest are measured from; the box's centre by default), ?limit (at most
// MAP_PINS_LIMIT). All of Russia may be thousands of rows: a request gets the
// nearest `limit`, and the same question is answered from memory for a while.

export const dynamic = 'force-dynamic';

/** How long an answer is reused for the same viewport. */
const MAP_CACHE_MS = 30_000;
const CACHE_MAX_KEYS = 64;
const cache = new Map<string, { at: number; body: MapPins & { intake: unknown } }>();

function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bbox = parseBbox(params.get('bbox'));
  const lat = coordinate(params.get('lat'), 90);
  const lon = coordinate(params.get('lon'), 180);
  const around = lat !== null && lon !== null ? { lat, lon } : null;
  const limit = Math.min(
    MAP_PINS_LIMIT,
    Math.max(1, Number(params.get('limit')) || MAP_PINS_LIMIT),
  );
  // Two decimals (~1 km) of the box and the point: neighbouring views share an answer.
  const key = [
    bbox ? [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(2)).join(',') : '',
    around ? `${around.lat.toFixed(2)},${around.lon.toFixed(2)}` : '',
    limit,
  ].join('|');
  const headers = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' };
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < MAP_CACHE_MS) return NextResponse.json(hit.body, { headers });
  try {
    const { providers, customers } = await loadMapPins(prisma, { bbox, around, limit });
    const body = { providers, customers, intake: intakePoints(providers) };
    if (cache.size >= CACHE_MAX_KEYS) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: now, body });
    return NextResponse.json(body, { headers });
  } catch (error) {
    console.error('[providers/map] failed', error);
    return NextResponse.json({ error: 'Карта временно недоступна' }, { status: 503 });
  }
}
