import { prisma } from '@specai/database';
import { guideRole, nextSteps, type GuideState, type GuideUser } from '@/lib/guide';

type StatusCounts = Partial<Record<string, number>>;

function bookingCounts(groups: { status: string; _count: { _all: number } }[]) {
  const counts: StatusCounts = {};
  for (const group of groups) counts[group.status] = group._count._all;
  return {
    bookingsPending: counts.PENDING ?? 0,
    bookingsConfirmed: counts.CONFIRMED ?? 0,
    bookingsActive: counts.ACTIVE ?? 0,
    bookingsCompleted: counts.COMPLETED ?? 0,
    bookingsTotal: Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0),
  };
}

/** Reads from the database what the guide needs to know about this user. */
export async function loadGuideState(
  user: (GuideUser & { id: string }) | null | undefined,
): Promise<GuideState> {
  const role = guideRole(user);
  if (!user || role === 'GUEST') return {};
  const commentsWritten = prisma.comment.count({ where: { authorId: user.id } });

  if (role === 'PROVIDER' && user.companyId) {
    const companyId = user.companyId;
    const [company, equipmentCount, groups, newOrders, bidsSent, comments] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { baseLat: true, baseLon: true, pinNote: true },
      }),
      prisma.equipment.count({ where: { companyId, status: { not: 'RETIRED' } } }),
      prisma.booking.groupBy({
        by: ['status'],
        where: { equipment: { companyId } },
        _count: { _all: true },
      }),
      prisma.order.count({
        where: {
          status: 'OPEN',
          NOT: { customer: { companyId } },
          bids: { none: { equipment: { companyId } } },
        },
      }),
      prisma.bid.count({ where: { equipment: { companyId } } }),
      commentsWritten,
    ]);
    return {
      equipmentCount,
      equipmentWithPrice: equipmentCount,
      hasBase: company?.baseLat != null && company?.baseLon != null,
      hasPinNote: Boolean(company?.pinNote?.trim()),
      newOrders,
      bidsSent,
      commentsWritten: comments,
      ...bookingCounts(groups),
    };
  }

  const [orders, groups, reviewsWritten, comments] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: user.id, status: 'OPEN' },
      select: { id: true, _count: { select: { bids: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.booking.groupBy({
      by: ['status'],
      where: { customerId: user.id },
      _count: { _all: true },
    }),
    prisma.review.count({ where: { authorId: user.id } }),
    commentsWritten,
  ]);
  const totalOrders = await prisma.order.count({ where: { customerId: user.id } });
  const waiting = orders.filter((order) => order._count.bids === 0);
  const withBids = orders.filter((order) => order._count.bids > 0);
  return {
    orders: totalOrders,
    openOrdersWithoutBids: waiting.length,
    waitingOrderId: waiting[0]?.id ?? null,
    ordersWithBids: withBids.length,
    choiceOrderId: withBids[0]?.id ?? null,
    reviewsWritten,
    commentsWritten: comments,
    ...bookingCounts(groups),
  };
}

/** The guide for a signed-in user or a guest. */
export async function guideFor(user: (GuideUser & { id: string }) | null | undefined) {
  return nextSteps(user, await loadGuideState(user));
}
