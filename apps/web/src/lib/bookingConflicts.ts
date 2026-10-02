import type { Prisma } from '@specai/database';

/**
 * Serialises every booking change for one machine until the surrounding
 * transaction ends: parallel requests for the same equipment wait here, so an
 * overlap check followed by a write inside the same transaction cannot race.
 */
export async function lockEquipment(tx: Prisma.TransactionClient, equipmentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${equipmentId}))`;
}

/**
 * First booking of the machine that shares at least one day with
 * [startDate, endDate] (both inclusive) and is in one of `statuses`.
 */
export function findOverlappingBooking(
  tx: Prisma.TransactionClient,
  args: {
    equipmentId: string;
    startDate: Date;
    endDate: Date;
    statuses: readonly ('PENDING' | 'CONFIRMED' | 'ACTIVE')[];
    excludeBookingId?: string;
  },
) {
  return tx.booking.findFirst({
    where: {
      equipmentId: args.equipmentId,
      status: { in: [...args.statuses] },
      startDate: { lte: args.endDate },
      endDate: { gte: args.startDate },
      ...(args.excludeBookingId ? { id: { not: args.excludeBookingId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
}
