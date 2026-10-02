import { NextResponse } from 'next/server';
import { GEO_USER_AGENT, tileAllowed } from '@/lib/geo';
import { checkRateLimit } from '@/lib/rateLimit';

// OpenStreetMap tiles through the site: cached for a week on Vercel's CDN,
// so visitors get them fast and reliably and the volunteer-run OSM servers
// see a handful of requests (their tile policy asks for caching and an
// identifying User-Agent). The «© участники OpenStreetMap» credit stays on
// the map. GET /api/tiles/17/84614/40983 (a .png suffix on y is accepted).

export async function GET(
  request: Request,
  { params }: { params: { z: string; x: string; y: string } },
) {
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y.replace(/\.png$/, ''));
  const max = 2 ** z;
  if (
    ![z, x, y].every(Number.isInteger) ||
    z < 3 ||
    z > 19 ||
    x < 0 ||
    y < 0 ||
    x >= max ||
    y >= max
  ) {
    return new NextResponse('Bad tile', { status: 400 });
  }
  if (!tileAllowed(z, x, y)) return new NextResponse('Outside the service area', { status: 404 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`tiles:${ip}`, { limit: 480, windowMs: 60_000 }).ok) {
    return new NextResponse('Too many requests', { status: 429 });
  }
  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { 'User-Agent': GEO_USER_AGENT },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return new NextResponse('Tile unavailable', { status: 502 });
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  } catch {
    return new NextResponse('Tile unavailable', { status: 502 });
  }
}
