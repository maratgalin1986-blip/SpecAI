import { prisma } from '@specai/database';
import { customerRates } from './equipmentCatalog';
import { OWN_FLEET } from './fleet';
import { BUSY_STATUSES } from './lineStanding';
import {
  basePoint,
  baseMachines,
  liveMachines,
  NEARBY_BASE_SCAN,
  NEARBY_MAX_ROWS,
  PRESENCE_FRESH_MS,
  type BaseMachine,
  type LiveMachine,
} from './linePresence';

const DAY_MS = 24 * 60 * 60_000;

/**
 * The machines «на линии» around a point (or the freshest across Russia
 * without one) and СпецПласт16's free machines at the base, as GET
 * /api/line/nearby and the «Сейчас на линии» block above the order forms
 * show them (lib/linePresence.ts has the rules: fresh, not past the evening
 * cutoff, AVAILABLE, prices from customerRates, never a phone or an account id).
 */
export async function loadLineNearby(
  around: { lat: number; lon: number } | null,
  km: number,
  now: Date = new Date(),
): Promise<{ machines: LiveMachine[]; base: BaseMachine[] }> {
  // A bounding box in SQL keeps far-away rows from using up the row cap; the
  // exact radius is applied in liveMachines.
  const latSpan = km / 111;
  const lonSpan = km / Math.max(0.1, 111 * Math.cos((around?.lat ?? 0) * (Math.PI / 180)));
  const freshSince = new Date(now.getTime() - PRESENCE_FRESH_MS);
  // «На линии на 5 рабочих дней» (lib/lineStanding.ts): seen without GPS too.
  const standing = [{ standingForever: true }, { standingUntil: { gt: now } }];
  const housePromise = prisma.equipment.findMany({
    where: {
      ...OWN_FLEET,
      status: 'AVAILABLE',
      // A machine whose driver is online is a live pin, not a base one.
      linePresences: {
        none: { OR: [{ online: true, updatedAt: { gte: freshSince } }, ...standing] },
      },
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
      OR: [
        {
          online: true,
          updatedAt: { gte: freshSince },
          // A session begun over a day ago is past its evening cutoff in any
          // zone: such phones left on do not use up the row cap. The exact
          // cutoff (the phone's own zone) is applied in liveMachines.
          OR: [{ onlineSince: null }, { onlineSince: { gte: new Date(now.getTime() - DAY_MS) } }],
          ...(around
            ? {
                lat: { gte: around.lat - latSpan, lte: around.lat + latSpan },
                lon: { gte: around.lon - lonSpan, lte: around.lon + lonSpan },
              }
            : {}),
        },
        // A standing line is placed at its base, which the box above cannot
        // see: the radius is applied in liveMachines.
        ...standing,
      ],
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
          location: { select: { latitude: true, longitude: true } },
          company: { select: { baseLat: true, baseLon: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: NEARBY_MAX_ROWS,
  });
  const [rows, houseRows] = await Promise.all([presencePromise, housePromise]);
  const equipmentIds = [...new Set(rows.flatMap((row) => row.equipmentId ?? []))];
  // Busy days (lib/lineStanding.ts busyDays): the next two weeks' CONFIRMED/ACTIVE bookings.
  const bookings = equipmentIds.length
    ? await prisma.booking.findMany({
        where: {
          equipmentId: { in: equipmentIds },
          status: { in: [...BUSY_STATUSES] },
          endDate: { gte: new Date(now.getTime() - DAY_MS) },
          startDate: { lte: new Date(now.getTime() + 15 * DAY_MS) },
        },
        select: { equipmentId: true, startDate: true, endDate: true, status: true },
        orderBy: { startDate: 'asc' },
        take: 2000,
      })
    : [];
  const machines = liveMachines(
    rows.map((row) => ({
      ...row,
      basePoint: row.equipment
        ? basePoint({ location: row.equipment.location, company: row.equipment.company })
        : null,
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
    bookings,
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
  return { machines, base };
}
