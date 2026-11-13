// Reads the numbers of the owner's weekly report (lib/weeklyReport.ts) from the
// database: counts and groups only, never a customer's name, phone or text.
import { prisma } from '@specai/database';
import { HOUSE_COMPANY_ID, OWN_FLEET } from './fleet';
import { PRESENCE_FRESH_MS } from './linePresence';
import type { ReportWeek, WeekStats, WeeklyData } from './weeklyReport';

/** No week has this many different sources or statuses; the cap is a safety net. */
const GROUPS_MAX = 2000;

async function weekStats(start: Date, end: Date): Promise<WeekStats> {
  const createdAt = { gte: start, lt: end };
  // Chat messages the moderation turned down (lib/orderModeration.ts) are not requests.
  const rejected = { status: 'CANCELLED' as const, moderationDecision: 'REJECT' };
  const [leads, deals, orders, rejectedImports, bookings, providers, machines, reviews] =
    await Promise.all([
      prisma.lead.groupBy({
        by: ['source', 'status'],
        // Bot drafts without a phone are not requests yet.
        where: { createdAt, NOT: { phone: '' } },
        _count: { _all: true },
        orderBy: [{ source: 'asc' }, { status: 'asc' }],
        take: GROUPS_MAX,
      }),
      prisma.lead.aggregate({
        where: { createdAt, NOT: { phone: '' }, outcome: 'deal' },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.order.groupBy({
        by: ['source'],
        // Not `NOT: rejected`: with a NULL decision SQL drops every cancelled
        // request (tasks/lessons.md, 38).
        where: {
          createdAt,
          OR: [
            { status: { not: 'CANCELLED' } },
            { moderationDecision: null },
            { moderationDecision: { not: 'REJECT' } },
          ],
        },
        _count: { _all: true },
        orderBy: { source: 'asc' },
        take: GROUPS_MAX,
      }),
      prisma.order.count({ where: { createdAt, ...rejected } }),
      prisma.booking.groupBy({
        by: ['status'],
        where: { createdAt },
        _count: { _all: true },
        orderBy: { status: 'asc' },
        take: GROUPS_MAX,
      }),
      prisma.company.count({
        where: { createdAt, isProvider: true, id: { not: HOUSE_COMPANY_ID } },
      }),
      prisma.equipment.count({ where: { createdAt, company: { isProvider: true } } }),
      prisma.review.aggregate({
        where: { createdAt },
        _count: { _all: true },
        _sum: { rating: true },
      }),
    ]);
  return {
    leads: leads.map((row) => ({
      source: row.source,
      status: row.status,
      count: row._count._all,
    })),
    deals: { count: deals._count._all, amount: deals._sum.amount ?? 0 },
    orders: orders.map((row) => ({ source: row.source, count: row._count._all })),
    rejectedImports,
    bookings: bookings.map((row) => ({ status: row.status, count: row._count._all })),
    providers,
    machines,
    reviews: { count: reviews._count._all, ratingSum: reviews._sum.rating ?? 0 },
  };
}

/** Everything buildWeeklyReport needs for `week` and the week before it. */
export async function loadWeeklyData(
  week: ReportWeek,
  now: Date = new Date(),
): Promise<WeeklyData> {
  const inWeek = { gte: week.start, lt: week.end };
  const others = { companyId: { not: HOUSE_COMPANY_ID } };
  const [current, previous, lineNow, house, joined, priceUpdates, orders, reviews, comments] =
    await Promise.all([
      weekStats(week.start, week.end),
      weekStats(week.previousStart, week.start),
      // On the line at this moment: a fresh report from the phone or a standing
      // «на линии до …» (lib/lineStanding.ts).
      prisma.linePresence.count({
        where: {
          ...others,
          OR: [
            { online: true, updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) } },
            { standingForever: true },
            { standingUntil: { gt: now } },
          ],
        },
      }),
      // «Всегда на линии» (lib/houseLine.ts): the house fleet's free machines.
      prisma.equipment.count({ where: { ...OWN_FLEET, status: 'AVAILABLE' } }),
      prisma.linePresence.count({
        where: { ...others, OR: [{ onlineSince: inWeek }, { standingSince: inWeek }] },
      }),
      prisma.equipment.groupBy({
        by: ['companyId'],
        where: { ...others, availabilityUpdatedAt: inWeek },
        orderBy: { companyId: 'asc' },
        take: GROUPS_MAX,
      }),
      prisma.order.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.review.count({ where: { textStatus: 'PENDING', NOT: { comment: null } } }),
      prisma.comment.count({ where: { status: 'PENDING' } }),
    ]);
  return {
    current,
    previous,
    line: { now: lineNow, house, joined },
    priceUpdates: priceUpdates.length,
    waiting: { orders, reviewTexts: reviews + comments },
  };
}
