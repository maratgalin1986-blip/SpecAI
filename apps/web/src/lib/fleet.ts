// Owner's decision (2026-10-06): an aggregator, «такси для спецтехники». Any
// provider company publishes its fleet and bids on orders; СпецПласт16's own
// fleet takes part alongside them and always comes first. Kept free of Prisma
// imports so client components can use it; a test checks the id against
// @specai/database.
export const HOUSE_COMPANY_ID = 'specplast16-house';

/** СпецПласт16's own fleet (house badge, owner-only views). */
export const OWN_FLEET = { companyId: HOUSE_COMPANY_ID } as const;

/**
 * Prisma `where` fragment for public equipment queries: every provider
 * company's fleet (СпецПласт16 is one of them).
 */
export const PUBLIC_FLEET = { company: { isProvider: true } } as const;

/**
 * The catalog, the map and «Похожая техника»: every provider's machinery
 * except what was taken off the site (RETIRED, «Снять с публикации»).
 */
export const PUBLISHED_FLEET = { ...PUBLIC_FLEET, status: { not: 'RETIRED' as const } };

type MaybeUser = { role?: string | null; companyId?: string | null } | null | undefined;

/** Any provider account with a company: manages its fleet, bookings and bids. */
export function isProvider<T extends MaybeUser>(
  user: T,
): user is NonNullable<T> & { companyId: string } {
  return user?.role === 'PROVIDER_ADMIN' && Boolean(user.companyId);
}

/** The owner's own fleet account (СпецПласт16). */
export function isHouseManager<T extends MaybeUser>(
  user: T,
): user is NonNullable<T> & { companyId: string } {
  return isProvider(user) && user.companyId === HOUSE_COMPANY_ID;
}

/** Whether a piece of equipment belongs to СпецПласт16 (for the «Парк СпецПласт16» badge). */
export function isHouseEquipment(item: { companyId?: string | null }): boolean {
  return item.companyId === HOUSE_COMPANY_ID;
}

/**
 * Whether customers may see and order a machine: it belongs to a provider
 * company (the same rule as PUBLIC_FLEET, for rows already loaded with their
 * company).
 */
export function isPublicEquipment(
  item: { company?: { isProvider?: boolean | null } | null } | null | undefined,
): boolean {
  return Boolean(item?.company?.isProvider);
}

/**
 * СпецПласт16 always comes first (the owner's rule): its own machinery and
 * bids lead every list, the rest keep their order.
 */
export function houseFirst<T>(
  items: T[],
  companyIdOf: (item: T) => string | null | undefined,
): T[] {
  return [...items].sort(
    (a, b) =>
      Number(companyIdOf(b) === HOUSE_COMPANY_ID) - Number(companyIdOf(a) === HOUSE_COMPANY_ID),
  );
}

/**
 * Prisma ordering that puts the house fleet first. Company ids are cuids
 * (they start with «c»), so descending order puts «specplast16-house» ahead.
 */
export const HOUSE_FIRST_ORDER = { companyId: 'desc' } as const;
