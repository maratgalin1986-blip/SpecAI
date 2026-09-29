import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geo';
import { checkRateLimit } from '@/lib/rateLimit';

// Address → coordinates for the order form's map preview:
// GET /api/geocode?q=Набережные Челны, проспект Мира 49
// Nominatim asks for no more than about one request per second from a site,
// hence the per-visitor limit and the 30-day cache in geocodeAddress.

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) return NextResponse.json({ error: 'Введите адрес' }, { status: 400 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`geocode:${ip}`, { limit: 20, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }
  const place = await geocodeAddress(q);
  if (!place) return NextResponse.json({ error: 'Адрес не найден' }, { status: 404 });
  return NextResponse.json(
    { place },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
