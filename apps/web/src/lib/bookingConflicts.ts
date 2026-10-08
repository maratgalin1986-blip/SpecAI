import type { Prisma } from '@specai/database';

/**
 * Serialises every booking change for one machine until the surrounding
 * transaction ends: parallel requests for the same equipment wait here, so an
 * overlap check followed by a write inside the same transaction cannot race.
 */
export async function lockEquipment(tx: Prisma.TransactionClient, equipmentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${equipmentId}))`;
}

export interface BookingConflict {
  id: string;
  startDate: Date;
  endDate: Date;
  /** A booking status, or BLOCKED for a day the provider took off the calendar. */
  status: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
}

/**
 * First booking of the machine that shares at least one day with
 * [startDate, endDate] (both inclusive) and is in one of `statuses`; when
 * there is none, the first manual block («Не сдаётся», EquipmentBlock) on
 * those days, reported with status BLOCKED.
 */
export async function findOverlappingBooking(
  tx: Prisma.TransactionClient,
  args: {
    equipmentId: string;
    startDate: Date;
    endDate: Date;
    statuses: readonly ('PENDING' | 'CONFIRMED' | 'ACTIVE')[];
    excludeBookingId?: string;
  },
): Promise<BookingConflict | null> {
  const booking = await tx.booking.findFirst({
    where: {
      equipmentId: args.equipmentId,
      status: { in: [...args.statuses] },
      startDate: { lte: args.endDate },
      endDate: { gte: args.startDate },
      ...(args.excludeBookingId ? { id: { not: args.excludeBookingId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (booking) return booking;
  const block = await findOverlappingBlock(tx, args);
  return block
    ? { id: block.id, startDate: block.from, endDate: block.to, status: 'BLOCKED' }
    : null;
}

/** First manual block of the machine on any of the days [startDate, endDate]. */
export function findOverlappingBlock(
  tx: Prisma.TransactionClient,
  args: { equipmentId: string; startDate: Date; endDate: Date },
) {
  return tx.equipmentBlock.findFirst({
    where: {
      equipmentId: args.equipmentId,
      from: { lte: args.endDate },
      to: { gte: args.startDate },
    },
    select: { id: true, from: true, to: true, reason: true },
  });
}
