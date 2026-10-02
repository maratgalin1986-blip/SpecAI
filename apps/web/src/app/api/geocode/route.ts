import { NextRequest, NextResponse } from 'next/server';
import { GEOCODER_UNAVAILABLE_MESSAGE, lookupAddress } from '@/lib/geo';
import { checkRateLimit } from '@/lib/rateLimit';

// Address → coordinates for the order form's map preview:
// GET /api/geocode?q=Набережные Челны, проспект Мира 49
// Nominatim asks for no more than about one request per second from a site,
// hence the per-visitor limit and the 30-day cache in geocodeAddress.
// 404 — the address does not exist; 503 — the geocoder did not answer.

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) return NextResponse.json({ error: 'Введите адрес' }, { status: 400 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`geocode:${ip}`, { limit: 20, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }
  const result = await lookupAddress(q);
  if (result.status === 'unavailable') {
    return NextResponse.json(
      { error: GEOCODER_UNAVAILABLE_MESSAGE, reason: 'unavailable' },
      { status: 503 },
    );
  }
  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Адрес не найден', reason: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(
    { place: result.place },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
