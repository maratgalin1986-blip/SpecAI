import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import type { ProviderForMatch } from './notifications/routing';
import { incomingOrdersWhere, matchIncoming } from './providerFeed';

/** How many open orders are checked against the company (newest first). */
const CANDIDATES = 1000;

/**
 * The company as the new-order alert sees it (its machine types, base and
 * radius), and the category tree: what lib/providerFeed.ts matchIncoming needs.
 */
export async function loadProviderMatch(companyId: string) {
  const [provider, categoryRows] = await Promise.all([
    loadProviderForMatch(companyId),
    prisma.equipmentCategory.findMany({ select: { id: true, slug: true, parentId: true } }),
  ]);
  return { provider, categoryRows };
}

/** The company alone (its machine types, base and radius), for matchIncoming. */
export async function loadProviderForMatch(companyId: string): Promise<ProviderForMatch> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      baseLat: true,
      baseLon: true,
      baseAddress: true,
      deliveryRadiusKm: true,
      equipment: {
        where: { status: { not: 'RETIRED' } },
        select: { categoryId: true },
        distinct: ['categoryId'],
      },
    },
  });
  return {
    categoryIds: company?.equipment.map((item) => item.categoryId) ?? [],
    baseLat: company?.baseLat,
    baseLon: company?.baseLon,
    radiusKm: company?.deliveryRadiusKm,
    baseAddress: company?.baseAddress,
    isHouse: companyId === HOUSE_COMPANY_ID,
  };
}

/**
 * The cabinet's incoming orders: open orders its machinery can take within
 * its radius that it has not priced yet (the rule of the new-order alert).
 * `total` counts all of them, `items` holds the newest `take`.
 */
export async function loadIncomingOrders(companyId: string, take = 6) {
  const { provider, categoryRows } = await loadProviderMatch(companyId);
  if (provider.categoryIds.length === 0) return { total: 0, items: [] };
  const candidates = await prisma.order.findMany({
    where: incomingOrdersWhere(companyId),
    include: {
      category: { select: { name: true } },
      customer: { select: { name: true } },
      location: {
        select: { latitude: true, longitude: true, city: true, addressLine: true },
      },
      _count: { select: { bids: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATES,
  });
  const matched = matchIncoming(provider, categoryRows, candidates);
  return { total: matched.length, items: matched.slice(0, take) };
}
