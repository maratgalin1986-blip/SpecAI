// Which open orders a provider company is offered: the web cabinet's
// «Входящие заявки» and the app's «Подходят мне» (api/orders?scope=near).
// The same rule as the new-order alert (lib/notifications/routing.ts:
// acceptedCategoryIds + providerMatchesOrder, the place by lib/geo.ts
// orderPoint). Pure, unit-tested; providerFeedData.ts loads the rows.
import { moscowDateKey } from './bookingRules';
import { distanceKm, orderPoint } from './geo';
import { SITE } from './site';
import {
  acceptedCategoryIds,
  providerMatchesOrder,
  type CategoryRow,
  type ProviderForMatch,
} from './notifications/routing';

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

export interface IncomingCandidate {
  categoryId: string | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    addressLine?: string | null;
  } | null;
}

/**
 * The orders that fit the company: machinery that can take them (the
 * category, its family and group) within its delivery radius of the work
 * site, or of the city's centre when only the city is known. A company with
 * no machinery yet is offered nothing.
 */
export function matchIncoming<T extends IncomingCandidate>(
  company: ProviderForMatch,
  categoryRows: readonly CategoryRow[],
  orders: readonly T[],
  homeCity: string = SITE.city,
): T[] {
  const base =
    typeof company.baseLat === 'number' && typeof company.baseLon === 'number'
      ? { lat: company.baseLat, lon: company.baseLon }
      : null;
  const matched: { order: T; km: number | null }[] = [];
  for (const order of orders) {
    const point = orderPoint(order.location, homeCity);
    const fits = providerMatchesOrder(company, {
      categoryId: order.categoryId,
      categoryIds: acceptedCategoryIds(order.categoryId, categoryRows),
      lat: point?.lat,
      lon: point?.lon,
      city: order.location?.city,
    });
    if (fits) matched.push({ order, km: base && point ? distanceKm(base, point) : null });
  }
  // «Рядом» means nearest first; orders with no known place keep their order
  // (newest first) after them.
  return matched.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)).map((item) => item.order);
}
