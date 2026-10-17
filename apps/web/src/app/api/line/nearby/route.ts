import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { customerRates } from '@/lib/equipmentCatalog';
import { OWN_FLEET } from '@/lib/fleet';
import {
  baseMachines,
  liveMachines,
  NEARBY_BASE_SCAN,
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
  const now = new Date();
  // A bounding box in SQL keeps far-away rows from using up the row cap; the
  // exact radius is applied in liveMachines.
  const latSpan = km / 111;
  const lonSpan = km / Math.max(0.1, 111 * Math.cos((around?.lat ?? 0) * (Math.PI / 180)));
  const freshSince = new Date(now.getTime() - PRESENCE_FRESH_MS);
  const housePromise = prisma.equipment.findMany({
    where: {
      ...OWN_FLEET,
      status: 'AVAILABLE',
      // A machine whose driver is online is a live pin, not a base one.
      linePresences: { none: { online: true, updatedAt: { gte: freshSince } } },
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      status: true,
      hourlyRate: true,
      dailyRate: true,
      category: { select: { name: true, slug: true } },
      location: { select: { latitude: true, longitude: true } },
      company: { select: { baseLat: true, baseLon: true } },
    },
    orderBy: { name: 'asc' },
    // The radius and the nearest NEARBY_BASE_MAX are chosen in baseMachines.
    take: NEARBY_BASE_SCAN,
  });
  const presencePromise = prisma.linePresence.findMany({
    where: {
      online: true,
      updatedAt: { gte: freshSince },
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
  const [rows, houseRows] = await Promise.all([presencePromise, housePromise]);
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
  const liveIds = new Set(machines.flatMap((machine) => machine.equipment?.id ?? []));
  const base = baseMachines(
    houseRows.map((row) => {
      // The house price list as the floor, the same numbers as on the card.
      const rates = customerRates({ ...row, categoryName: row.category?.name ?? '' });
      return { ...row, hourlyRate: rates.hourlyRate, dailyRate: rates.dailyRate };
    }),
    liveIds,
    around,
    km,
  );
  return NextResponse.json({ machines, base, around, km });
}
