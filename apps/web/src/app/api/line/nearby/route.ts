import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { customerRates } from '@/lib/equipmentCatalog';
import {
  liveMachines,
  NEARBY_DEFAULT_KM,
  NEARBY_MAX_KM,
  PRESENCE_FRESH_MS,
} from '@/lib/linePresence';

export const dynamic = 'force-dynamic';

/**
 * The machines «на линии» around a point: GET /api/line/nearby?lat&lon&km.
 * Signed-in users only (the home map of the app); without a point the whole
 * fresh list, for a map centred on the city. Each row carries the bubble
 * text, the machine's customer price and the driver's short name — never a
 * phone. Positions are the phones' own, as the drivers chose to show them.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const around =
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { lat, lon }
      : null;
  const km = Math.min(NEARBY_MAX_KM, Math.max(1, Number(params.get('km')) || NEARBY_DEFAULT_KM));
  const now = new Date();
  const rows = await prisma.linePresence.findMany({
    where: { online: true, updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) } },
    include: {
      user: { select: { name: true } },
      company: { select: { id: true, name: true, verified: true } },
      equipment: {
        select: {
          id: true,
          name: true,
          companyId: true,
          hourlyRate: true,
          dailyRate: true,
          category: { select: { name: true, slug: true } },
        },
      },
    },
    take: 500,
  });
  const machines = liveMachines(
    rows.map((row) => ({
      ...row,
      equipment: row.equipment
        ? {
            id: row.equipment.id,
            name: row.equipment.name,
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
