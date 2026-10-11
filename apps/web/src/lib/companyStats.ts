import { prisma } from '@specai/database';
import { EMPTY_STATS, reliability, tallyBookings, type CompanyStats } from './reliability';

/**
 * Trust numbers for several provider companies at once (offer cards, the
 * public provider page, the cabinet): verified mark, bookings by status,
 * ratings and the providers its users invited. Missing companies get empty
 * stats, so the caller can always look one up.
 */
export async function loadCompanyStats(companyIds: string[]): Promise<Map<string, CompanyStats>> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const result = new Map<string, CompanyStats>();
  if (ids.length === 0) return result;

  const [companies, bookings, ratings, invited] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, verified: true } }),
    prisma.booking.findMany({
      where: { equipment: { companyId: { in: ids } } },
      select: { status: true, equipment: { select: { companyId: true } } },
      take: 10_000,
    }),
    prisma.review.groupBy({
      by: ['companyId'],
      where: { companyId: { in: ids } },
      _sum: { rating: true },
      _count: { _all: true },
    }),
    loadInvitedProviders(ids),
  ]);

  const byCompany = tallyBookings(
    bookings.map((row) => ({ status: row.status, companyId: row.equipment.companyId })),
  );
  for (const id of ids) result.set(id, { ...EMPTY_STATS, bookings: {} });
  for (const company of companies) {
    result.get(company.id)!.verified = company.verified;
  }
  for (const [id, counts] of byCompany) {
    const stats = result.get(id);
    if (stats) stats.bookings = counts;
  }
  for (const row of ratings) {
    const stats = result.get(row.companyId);
    if (stats) {
      stats.ratingSum = row._sum.rating ?? 0;
      stats.ratingCount = row._count._all;
    }
  }
  for (const [id, n] of invited) {
    const stats = result.get(id);
    if (stats) stats.invitedProviders = n;
  }
  return result;
}

/** Providers signed up by invitation of each company's users. */
async function loadInvitedProviders(companyIds: string[]): Promise<Map<string, number>> {
  const members = await prisma.user.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true, companyId: true },
    take: 5000,
  });
  const companyOf = new Map(members.map((m) => [m.id, m.companyId ?? '']));
  if (companyOf.size === 0) return new Map();
  const invited = await prisma.user.groupBy({
    by: ['referredById'],
    where: { referredById: { in: [...companyOf.keys()] }, role: 'PROVIDER_ADMIN' },
    _count: { _all: true },
  });
  const result = new Map<string, number>();
  for (const row of invited) {
    const companyId = row.referredById ? companyOf.get(row.referredById) : undefined;
    if (companyId) result.set(companyId, (result.get(companyId) ?? 0) + row._count._all);
  }
  return result;
}

/** Stats and the derived trust signals for one company. */
export async function companyReliability(companyId: string) {
  const stats = (await loadCompanyStats([companyId])).get(companyId) ?? EMPTY_STATS;
  return reliability(stats);
}
