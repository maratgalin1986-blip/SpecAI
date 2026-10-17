import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { customerRates } from '@/lib/equipmentCatalog';
import {
  liveMachines,
  NEARBY_DEFAULT_KM,
  NEARBY_MAX_KM,
  NEARBY_MAX_ROWS,
  PRESENCE_FRESH_MS,
} from '@/lib/linePresence';

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
 * Positions are the phones' own, as the drivers chose to show them.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const lat = coordinate(params.get('lat'), 90);
  const lon = coordinate(params.get('lon'), 180);
  const around = lat !== null && lon !== null ? { lat, lon } : null;
  const km = Math.min(NEARBY_MAX_KM, Math.max(1, Number(params.get('km')) || NEARBY_DEFAULT_KM));
  const now = new Date();
  // A bounding box in SQL keeps far-away rows from using up the row cap; the
  // exact radius is applied in liveMachines.
  const latSpan = km / 111;
  const lonSpan = km / Math.max(0.1, 111 * Math.cos((around?.lat ?? 0) * (Math.PI / 180)));
  const rows = await prisma.linePresence.findMany({
    where: {
      online: true,
      updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) },
      ...(around
        ? {
            lat: { gte: around.lat - latSpan, lte: around.lat + latSpan },
            lon: { gte: around.lon - lonSpan, lte: around.lon + lonSpan },
          }
        : {}),
    },
    include: {
      user: { select: { name: true } },
      company: { select: { id: true, name: true, verified: true } },
      equipment: {
        select: {
          id: true,
          name: true,
          companyId: true,
          status: true,
          hourlyRate: true,
          dailyRate: true,
          category: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: NEARBY_MAX_ROWS,
  });
  const machines = liveMachines(
    rows.map((row) => ({
      ...row,
      equipment: row.equipment
        ? {
            id: row.equipment.id,
            name: row.equipment.name,
            status: row.equipment.status,
            category: row.equipment.category,
            // The customer's price: the house fleet never below the price list.
            ...customerRates({
              ...row.equipment,
              categoryName: row.equipment.category?.name ?? '',
            }),
          }
        : null,
    })),
    around,
    km,
    now,
  );
  return NextResponse.json({ machines, around, km });
}
