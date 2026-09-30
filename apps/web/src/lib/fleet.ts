// СпецПласт16 is the only executor on its site: the catalogue shows only the
// company's own fleet and only its fleet manager can act as the "provider".
// Old rows of other companies stay in the database but are never shown.
// Kept free of Prisma imports so client components can use it; a test
// checks the id against @specai/database.

export const HOUSE_COMPANY_ID = 'specplast16-house';

/** Prisma `where` fragment for public equipment queries. */
export const OWN_FLEET = { companyId: HOUSE_COMPANY_ID } as const;

type MaybeUser = { role?: string | null; companyId?: string | null } | null | undefined;

export function isFleetManager<T extends MaybeUser>(
  user: T,
): user is NonNullable<T> & { companyId: string } {
  return user?.role === 'PROVIDER_ADMIN' && user.companyId === HOUSE_COMPANY_ID;
}
