import { prisma } from '@specai/database';
import { loadCategoryGroups } from './orderBoardData';
import { incomingOrdersWhere, matchIncoming } from './providerFeed';

/** How many open orders are checked against the company (newest first). */
const CANDIDATES = 500;

/**
 * The cabinet's incoming orders: open orders of the company's categories
 * (by group) within its radius that it has not priced yet. `total` counts
 * all of them, `items` holds the newest `take`.
 */
export async function loadIncomingOrders(companyId: string, take = 6) {
  const [company, categories, groups, candidates] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { baseLat: true, baseLon: true, deliveryRadiusKm: true },
    }),
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: { categoryId: true },
      distinct: ['categoryId'],
    }),
    loadCategoryGroups(),
    prisma.order.findMany({
      where: incomingOrdersWhere(companyId),
      include: {
        category: { select: { name: true } },
        customer: { select: { name: true } },
        location: { select: { latitude: true, longitude: true } },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATES,
    }),
  ]);
  const matched = matchIncoming(
    {
      categoryIds: categories.map((row) => row.categoryId),
      baseLat: company?.baseLat,
      baseLon: company?.baseLon,
      radiusKm: company?.deliveryRadiusKm,
    },
    groups,
    candidates.map((order) => ({
      ...order,
      lat: order.location?.latitude,
      lon: order.location?.longitude,
    })),
  );
  return { total: matched.length, items: matched.slice(0, take) };
}
