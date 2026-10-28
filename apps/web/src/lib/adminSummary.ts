import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { signupWindows } from './adminStats';

/**
 * «Сводка за 7 и 30 дней» on /admin: orders placed, bookings made, their sum
 * (bookings the provider took: CONFIRMED, ACTIVE, COMPLETED — no online
 * payment, so this is the turnover agreed on the platform, not money received)
 * and new provider companies (СпецПласт16's own fleet not counted). Chat
 * imports waiting for moderation are not orders yet.
 */
export interface SummaryWindow {
  orders: number;
  bookings: number;
  /** Whole roubles, rounded once here. */
  turnover: number;
  providers: number;
}

export interface AdminSummary {
  week: SummaryWindow;
  month: SummaryWindow;
}

export const TURNOVER_STATUSES = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

/** Decimal | number | null → whole roubles. */
export function toRoubles(sum: { toString(): string } | number | null | undefined): number {
  if (sum === null || sum === undefined) return 0;
  const value = typeof sum === 'number' ? sum : Number(sum.toString());
  return Number.isFinite(value) ? Math.round(value) : 0;
}

async function loadWindow(since: Date): Promise<SummaryWindow> {
  const createdAt = { gte: since };
  const [orders, bookings, turnover, providers] = await Promise.all([
    prisma.order.count({ where: { createdAt, status: { not: 'PENDING_REVIEW' } } }),
    prisma.booking.count({ where: { createdAt } }),
    prisma.booking.aggregate({
      where: { createdAt, status: { in: [...TURNOVER_STATUSES] } },
      _sum: { totalPrice: true },
    }),
    prisma.company.count({
      where: { createdAt, isProvider: true, id: { not: HOUSE_COMPANY_ID } },
    }),
  ]);
  return { orders, bookings, turnover: toRoubles(turnover._sum.totalPrice), providers };
}

export async function loadAdminSummary(now: Date = new Date()): Promise<AdminSummary> {
  const windows = signupWindows(now);
  const [week, month] = await Promise.all([loadWindow(windows.week), loadWindow(windows.month)]);
  return { week, month };
}
