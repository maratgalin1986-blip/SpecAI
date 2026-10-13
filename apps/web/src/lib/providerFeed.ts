// «Входящие заявки» of a provider's cabinet: which open orders a company is
// offered. Pure, unit-tested; providerFeedData.ts loads the rows.
import { moscowDateKey } from './bookingRules';
import { providerMatchesOrder, type ProviderForMatch } from './notifications/routing';
import type { CategoryGroup } from './orderBoard';

/** Moscow midnight of today: orders that ended before it are stale. */
export function todayStartMsk(now: Date = new Date()): Date {
  return new Date(`${moscowDateKey(now)}T00:00:00+03:00`);
}

/**
 * Open orders the company has not bid on yet, not placed by its own managers,
 * and not over yet. The customer condition is null-safe: an ordinary customer
 * has no company, and `NOT: { customer: { companyId } }` becomes
 * NOT(NULL = X) in SQL, which dropped every such order.
 */
export function incomingOrdersWhere(companyId: string, now: Date = new Date()) {
  return {
    status: 'OPEN' as const,
    desiredEndDate: { gte: todayStartMsk(now) },
    customer: { OR: [{ companyId: null }, { companyId: { not: companyId } }] },
    bids: { none: { equipment: { companyId } } },
  };
}

/**
 * The company's categories widened to their whole groups: a provider with a
 * «JCB 3CX» category also sees orders for a backhoe loader of the same group.
 */
export function widenToGroups(
  categoryIds: readonly string[],
  groups: readonly CategoryGroup[],
): string[] {
  const result = new Set(categoryIds);
  for (const group of groups) {
    if (group.categoryIds.some((id) => result.has(id))) {
      group.categoryIds.forEach((id) => result.add(id));
    }
  }
  return [...result];
}

export interface IncomingCandidate {
  categoryId: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * The orders that fit the company: its categories (by group) within its
 * delivery radius. A company with no machinery yet sees every order, so the
 * cabinet shows the demand it could answer once a machine is added.
 */
export function matchIncoming<T extends IncomingCandidate>(
  company: ProviderForMatch,
  groups: readonly CategoryGroup[],
  orders: readonly T[],
): T[] {
  if (company.categoryIds.length === 0) return [...orders];
  const widened = { ...company, categoryIds: widenToGroups(company.categoryIds, groups) };
  return orders.filter((order) =>
    providerMatchesOrder(widened, { categoryId: order.categoryId, lat: order.lat, lon: order.lon }),
  );
}
