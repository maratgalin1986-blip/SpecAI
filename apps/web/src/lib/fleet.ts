// Owner's decision (2026-10-02): customers see and order only СпецПласт16's
// own fleet; provider accounts remain in the data model but are not public.
// Kept free of Prisma
// imports so client components can use it; a test checks the id against
// @specai/database.
export const HOUSE_COMPANY_ID = 'specplast16-house';

/** СпецПласт16's own fleet (house badge, owner-only views). */
export const OWN_FLEET = { companyId: HOUSE_COMPANY_ID } as const;

/** Prisma `where` fragment for public equipment queries: СпецПласт16's own fleet only. */
export const PUBLIC_FLEET = { companyId: HOUSE_COMPANY_ID } as const;

/**
 * The catalog, the map and «Похожая техника»: СпецПласт16's machinery except
 * what was taken off the site (RETIRED, «Снять с публикации»).
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
