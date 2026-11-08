import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { intakePoints } from '@/lib/intakePoints';
import { loadMapPins } from '@/lib/providerMapData';

// Public: the providers on the customers' map (/map) — name, point, marker
// picture, note and how much machinery each has. No phones, e-mails or
// addresses: toMapPins copies only the safe fields. `intake`: the platform's
// «приём заявок» points in big cities with no provider near (lib/intakePoints.ts):
// a city, its centre and the platform's own label, nothing else.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const providers = await loadMapPins(prisma);
    return NextResponse.json(
      { providers, intake: intakePoints(providers) },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[providers/map] failed', error);
    return NextResponse.json({ error: 'Карта временно недоступна' }, { status: 503 });
  }
}
