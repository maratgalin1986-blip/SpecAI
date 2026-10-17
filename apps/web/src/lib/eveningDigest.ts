// The evening digest (api/cron/evening, 19:00 Moscow): every provider gets
// one message with tomorrow's open orders in its categories and radius, and
// customers whose booking starts tomorrow are reminded. Pure, unit-tested.
import { moscowDateKey } from './bookingRules';
import { stripChatOrderNote } from './chatOrders';
import { providerMatchesOrder, type ProviderForMatch } from './notifications/routing';
import { maskContacts } from './privacy';

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
  /** acceptedCategoryIds(categoryId) — the machine types that can take it. */
  categoryIds?: string[] | null;
  categoryName?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  customerId: string;
  /** The order text: its first words tell nine «экскаваторы» apart. */
  description?: string | null;
  /** Work dates: shown when the job runs past tomorrow («17–19.10»). */
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface DigestCompany extends ProviderForMatch {
  id: string;
  userIds: string[];
}

/** How many characters of the order text go into a digest line. */
export const DIGEST_EXCERPT = 40;

function shortDay(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * «экскаватор, Елабуга, 17–19.10: копать траншею 100 м» — one line of the
 * digest. An order without a city names none («экскаватор, 17–19.10: …»):
 * no default town. The excerpt is masked and never carries the chat notice.
 */
export function digestItem(order: {
  categoryName?: string | null;
  city?: string | null;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const what = (order.categoryName ?? 'техника').toLowerCase();
  const where = order.city?.trim();
  const parts = [where ? `${what}, ${where}` : what];
  if (
    order.startDate &&
    order.endDate &&
    moscowDateKey(order.endDate) > moscowDateKey(order.startDate)
  ) {
    parts.push(`${shortDay(order.startDate)}–${shortDay(order.endDate)}`);
  }
  const text = order.description
    ? maskContacts(stripChatOrderNote(order.description)).replace(/\s+/g, ' ').trim()
    : '';
  const excerpt =
    text.length > DIGEST_EXCERPT ? `${text.slice(0, DIGEST_EXCERPT - 1).trimEnd()}…` : text;
  return excerpt ? `${parts.join(', ')}: ${excerpt}` : parts.join(', ');
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
            categoryIds: order.categoryIds,
            lat: order.lat,
            lon: order.lon,
            city: order.city,
          }),
      )
      .map(digestItem);
    if (items.length > 0 && company.userIds.length > 0) {
      result.push({ companyId: company.id, userIds: company.userIds, items });
    }
  }
  return result;
}
