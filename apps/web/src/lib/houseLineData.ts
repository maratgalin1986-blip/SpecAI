import type { PrismaClient } from '@specai/database';
import { OWN_FLEET } from './fleet';
import { houseLineMachines, type HouseLineMachine } from './houseLine';
import { NEARBY_BASE_SCAN } from './linePresence';
import { BUSY_STATUSES } from './lineStanding';

const DAY_MS = 24 * 60 * 60_000;

type Db = Pick<PrismaClient, 'equipment' | 'booking'>;

/**
 * СпецПласт16's machines on the line now (lib/houseLine.ts: «всегда на
 * линии», owner 2026-11-11): read from the fleet itself — free, published —
 * with today's bookings, so the answer is right after any deploy, evening or
 * expiry without a row to keep alive.
 */
export async function loadHouseLine(db: Db, now: Date = new Date()): Promise<HouseLineMachine[]> {
  const machines = await db.equipment.findMany({
    where: { ...OWN_FLEET, status: 'AVAILABLE' },
    select: {
      id: true,
      companyId: true,
      status: true,
      categoryId: true,
      location: { select: { latitude: true, longitude: true } },
      company: { select: { baseLat: true, baseLon: true } },
    },
    orderBy: { name: 'asc' },
    take: NEARBY_BASE_SCAN,
  });
  if (machines.length === 0) return [];
  const bookings = await db.booking.findMany({
    where: {
      equipmentId: { in: machines.map((machine) => machine.id) },
      status: { in: [...BUSY_STATUSES] },
      endDate: { gte: new Date(now.getTime() - DAY_MS) },
      startDate: { lte: new Date(now.getTime() + DAY_MS) },
    },
    select: { equipmentId: true, startDate: true, endDate: true, status: true },
    orderBy: { startDate: 'asc' },
    take: 2000,
  });
  return houseLineMachines(machines, bookings, now);
}
