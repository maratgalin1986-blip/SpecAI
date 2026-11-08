import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { loadLineNearby } from '@/lib/lineNearbyData';
import { NEARBY_DEFAULT_KM, NEARBY_MAX_KM } from '@/lib/linePresence';

export const dynamic = 'force-dynamic';

/** A query parameter as a coordinate, or null when it is missing or not a number. */
function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/**
 * The machines «на линии» around a point: GET /api/line/nearby?lat&lon&km.
 * Signed-in users only (the home map of the app); without a point the whole
 * fresh list (the freshest NEARBY_MAX_ROWS rows), for a map centred on the
 * city. Each row carries the bubble text, the machine's customer price and
 * the driver's short name — never a phone, never the driver's account id.
 * Positions are the phones' own, as the drivers chose to show them. A row
 * whose session the evening cutoff ended (21:00 in the phone's time zone,
 * lib/lineDay.ts) is left out even while that phone keeps reporting.
 *
 * `base`: СпецПласт16's own free machines at their base within the same
 * radius (lib/linePresence.ts baseMachines), priced by customerRates and
 * labelled «на базе» — a house machine whose driver is online is in
 * `machines` instead. Older apps read only `machines`.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const lat = coordinate(params.get('lat'), 90);
  const lon = coordinate(params.get('lon'), 180);
  const around = lat !== null && lon !== null ? { lat, lon } : null;
  const km = Math.min(NEARBY_MAX_KM, Math.max(1, Number(params.get('km')) || NEARBY_DEFAULT_KM));
  const { machines, base } = await loadLineNearby(around, km);
  return NextResponse.json({ machines, base, around, km });
}
