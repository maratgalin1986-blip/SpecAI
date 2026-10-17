import { prisma } from '@specai/database';
import { loadCompanyStats } from './companyStats';
import { loadCategoryGroups } from './orderBoardData';
import {
  filterProviderCards,
  isListed,
  providerCities,
  sortProviderCards,
  toProviderCard,
  type ProviderCard,
  type ProviderQuery,
  UNKNOWN_CITY,
} from './providerCards';
import { HOUSE_COMPANY_ID } from './fleet';
import { EMPTY_STATS } from './reliability';
import { SITE } from './site';

export interface ProviderList {
  cards: ProviderCard[];
  total: number;
  groups: { id: string; label: string }[];
  cities: string[];
  failed: boolean;
}

/**
 * Every provider company with a published fleet or a base, as cards, with the
 * filter options (category groups and base cities of the listed companies).
 * Filtering and sorting happen in memory: the list is a few hundred companies
 * at most. Without a database the list is empty and `failed` is set.
 */
export async function loadProviderCards(query: ProviderQuery): Promise<ProviderList> {
  try {
    const [companies, groups] = await Promise.all([
      prisma.company.findMany({
        where: { isProvider: true },
        select: {
          id: true,
          name: true,
          verified: true,
          baseAddress: true,
          deliveryRadiusKm: true,
          createdAt: true,
          pinImageUrl: true,
          location: { select: { city: true } },
          equipment: {
            where: { status: { not: 'RETIRED' } },
            select: {
              name: true,
              imageUrls: true,
              category: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 60,
          },
        },
        take: 300,
      }),
      loadCategoryGroups().catch(() => []),
    ]);
    const listed = companies.filter(isListed);
    const stats = await loadCompanyStats(listed.map((company) => company.id)).catch(
      () => new Map(),
    );
    const groupOfCategory = new Map(
      groups.flatMap((group) => group.categoryIds.map((id) => [id, group.id] as const)),
    );
    const created = new Map(listed.map((company) => [company.id, company.createdAt.getTime()]));
    const all = listed.map((company) =>
      toProviderCard(company, stats.get(company.id) ?? EMPTY_STATS, {
        // All of Russia: a company without a known city is not shown in СпецПласт16's.
        fallbackCity: company.id === HOUSE_COMPANY_ID ? SITE.city : UNKNOWN_CITY,
        groupOf: (categoryId) => groupOfCategory.get(categoryId),
      }),
    );
    const cards = sortProviderCards(
      filterProviderCards(all, query),
      query.sort,
      (card) => created.get(card.id) ?? 0,
    );
    const usedGroups = new Set(all.flatMap((card) => card.groupIds));
    return {
      cards,
      total: all.length,
      groups: groups
        .filter((group) => usedGroups.has(group.id) || group.id === query.group)
        .map((group) => ({ id: group.id, label: group.label })),
      cities: providerCities(all),
      failed: false,
    };
  } catch (error) {
    console.error('[providers] failed to load the list', error);
    return { cards: [], total: 0, groups: [], cities: [], failed: true };
  }
}
