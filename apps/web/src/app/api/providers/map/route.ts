import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { loadMapPins } from '@/lib/providerMapData';

// Public: the providers on the customers' map (/map) — name, point, marker
// picture, note and how much machinery each has. No phones, e-mails or
// addresses: toMapPins copies only the safe fields.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const providers = await loadMapPins(prisma);
    return NextResponse.json(
      { providers },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[providers/map] failed', error);
    return NextResponse.json({ error: 'Карта временно недоступна' }, { status: 503 });
  }
}
