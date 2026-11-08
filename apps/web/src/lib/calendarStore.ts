// Loads a machine's bookings and blocks around a month and hands them to the
// pure calendar functions (lib/occupancy.ts). Shared by
// GET /api/equipment/[id]/calendar, the cabinets and the public page.
import { prisma } from '@specai/database';
import { customerShortName } from './customerPrivacy';
import {
  calendarSummary,
  monthCalendar,
  nextFreeDate,
  type CalendarDay,
  type DayKind,
} from './occupancy';

export interface CalendarBookingJson {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  /** «Анна П.» — the provider never gets the full name here. */
  customer: string;
  totalPrice: string;
  currency: string;
  operator: { id: string; name: string } | null;
}

export interface CalendarBlockJson {
  id: string;
  from: string;
  to: string;
  reason: string | null;
}

export interface MachineCalendarJson {
  equipment: { id: string; name: string; status: string };
  year: number;
  month: number;
  days: CalendarDay[];
  summary: Record<DayKind, number>;
  /** YYYY-MM-DD of the next free day, or null. */
  nextFree: string | null;
  /** Only for the owner: what the days hold. */
  bookings: CalendarBookingJson[];
  blocks: CalendarBlockJson[];
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The month of a machine: every day's kind and, for the owning provider,
 * the bookings and blocks behind them. The public form carries the kinds
 * only, with no booking ids.
 */
export async function loadMachineCalendar(
  equipment: { id: string; name: string; status: string },
  period: { year: number; month: number },
  options: { owner: boolean; now?: Date },
): Promise<MachineCalendarJson> {
  const now = options.now ?? new Date();
  const monthStart = new Date(Date.UTC(period.year, period.month - 1, 1));
  const monthEnd = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));
  // Bookings and blocks that touch the month or the 90-day horizon of «next free».
  const horizonEnd = new Date(now.getTime() + 91 * 86_400_000);
  const rangeStart = new Date(Math.min(monthStart.getTime(), now.getTime() - 86_400_000));
  const rangeEnd = new Date(Math.max(monthEnd.getTime(), horizonEnd.getTime()));
  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        equipmentId: equipment.id,
        status: { not: 'CANCELLED' },
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        totalPrice: true,
        currency: true,
        customer: { select: { name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 500,
    }),
    prisma.equipmentBlock.findMany({
      where: { equipmentId: equipment.id, from: { lte: rangeEnd }, to: { gte: rangeStart } },
      orderBy: { from: 'asc' },
      take: 200,
    }),
  ]);
  const inMaintenance = equipment.status === 'IN_MAINTENANCE';
  const days = monthCalendar({ ...period, bookings, blocks, inMaintenance, today: now });
  const publicDays = options.owner
    ? days
    : days.map(({ date, kind, past }) => ({ date, kind, past }));
  return {
    equipment,
    year: period.year,
    month: period.month,
    days: publicDays,
    summary: calendarSummary(days),
    nextFree: nextFreeDate(bookings, blocks, { from: now, inMaintenance }),
    bookings: options.owner
      ? bookings.map((booking) => ({
          id: booking.id,
          status: booking.status,
          startDate: day(booking.startDate),
          endDate: day(booking.endDate),
          customer: customerShortName(booking.customer.name),
          totalPrice: booking.totalPrice.toString(),
          currency: booking.currency,
          operator: booking.operator,
        }))
      : [],
    blocks: options.owner
      ? blocks.map((block) => ({
          id: block.id,
          from: day(block.from),
          to: day(block.to),
          reason: block.reason,
        }))
      : [],
  };
}

/** The next free day of a published machine for its public page. */
export async function loadNextFreeDate(
  equipment: { id: string; status: string },
  now: Date = new Date(),
): Promise<string | null> {
  if (equipment.status === 'IN_MAINTENANCE' || equipment.status === 'RETIRED') return null;
  const horizonEnd = new Date(now.getTime() + 91 * 86_400_000);
  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        equipmentId: equipment.id,
        status: { not: 'CANCELLED' },
        startDate: { lte: horizonEnd },
        endDate: { gte: new Date(now.getTime() - 86_400_000) },
      },
      select: { id: true, status: true, startDate: true, endDate: true },
      take: 500,
    }),
    prisma.equipmentBlock.findMany({
      where: { equipmentId: equipment.id, from: { lte: horizonEnd }, to: { gte: now } },
      select: { id: true, from: true, to: true },
      take: 200,
    }),
  ]);
  return nextFreeDate(bookings, blocks, { from: now });
}
