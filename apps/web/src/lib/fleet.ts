// The site is an aggregator ("a taxi for heavy machinery"): any provider
// company publishes its fleet and answers customers' orders, and the owner's
// own company, СпецПласт16, takes part alongside them. Kept free of Prisma
// imports so client components can use it; a test checks the id against
// @specai/database.
export const HOUSE_COMPANY_ID = 'specplast16-house';

/** СпецПласт16's own fleet (house badge, owner-only views). */
export const OWN_FLEET = { companyId: HOUSE_COMPANY_ID } as const;

/** Prisma `where` fragment for public equipment queries: every provider's fleet. */
export const PUBLIC_FLEET = { company: { isProvider: true } } as const;

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
