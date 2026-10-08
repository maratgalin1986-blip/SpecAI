// The evening digest (api/cron/evening, 19:00 Moscow): every provider gets
// one message with tomorrow's open orders in its categories and radius, and
// customers whose booking starts tomorrow are reminded. Pure, unit-tested.
import { moscowDateKey } from './bookingRules';
import { providerMatchesOrder, type ProviderForMatch } from './notifications/routing';

const DAY_MS = 86_400_000;

/** [start, end) of tomorrow in Moscow, as instants. */
export function tomorrowRange(now: Date = new Date()): { start: Date; end: Date; key: string } {
  const todayKey = moscowDateKey(now);
  // Moscow midnight is 21:00 UTC of the previous day.
  const todayStart = new Date(`${todayKey}T00:00:00+03:00`);
  const start = new Date(todayStart.getTime() + DAY_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end, key: moscowDateKey(start) };
}

export interface DigestOrder {
  id: string;
  categoryId: string | null;
  categoryName?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  customerId: string;
}

export interface DigestCompany extends ProviderForMatch {
  id: string;
  userIds: string[];
}

/** «экскаватор, Елабуга» — one line of the digest. */
export function digestItem(order: { categoryName?: string | null; city?: string | null }) {
  const what = (order.categoryName ?? 'техника').toLowerCase();
  return order.city ? `${what}, ${order.city}` : what;
}

/**
 * Which orders each company hears about: those of its categories within its
 * own radius (providerMatchesOrder), never its own managers' orders.
 */
export function digestsForCompanies(
  companies: DigestCompany[],
  orders: DigestOrder[],
): { companyId: string; userIds: string[]; items: string[] }[] {
  const result: { companyId: string; userIds: string[]; items: string[] }[] = [];
  for (const company of companies) {
    const items = orders
      .filter(
        (order) =>
          !company.userIds.includes(order.customerId) &&
          providerMatchesOrder(company, {
            categoryId: order.categoryId,
            lat: order.lat,
            lon: order.lon,
          }),
      )
      .map(digestItem);
    if (items.length > 0 && company.userIds.length > 0) {
      result.push({ companyId: company.id, userIds: company.userIds, items });
    }
  }
  return result;
}
