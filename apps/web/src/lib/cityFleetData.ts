import { prisma } from '@specai/database';
import { cityOffer, houseArea, type City, type CityFleetRow, type CityOffer } from './cities';
import { HOUSE_COMPANY_ID, HOUSE_FIRST_ORDER, PUBLISHED_FLEET } from './fleet';
import type { Landing } from './landings';

type CategoryFleet = {
  rows: CityFleetRow[];
  house: Parameters<typeof houseArea>[0];
  /** False when the database could not be read. */
  loaded: boolean;
};

/**
 * Published machines of a category with where their company is based and how
 * far it goes, plus СпецПласт16's own base. Without a database: no rows and
 * the house's default area (the page then shows only what СпецПласт16's own
 * fleet covers, never invented machines).
 */
async function queryCategoryFleet(categorySlug: string): Promise<CategoryFleet> {
  try {
    const [rows, house] = await Promise.all([
      prisma.equipment.findMany({
        where: { ...PUBLISHED_FLEET, category: { slug: categorySlug } },
        select: {
          id: true,
          name: true,
          companyId: true,
          hourlyRate: true,
          dailyRate: true,
          company: {
            select: {
              name: true,
              baseLat: true,
              baseLon: true,
              deliveryRadiusKm: true,
              baseAddress: true,
            },
          },
          location: { select: { city: true, latitude: true, longitude: true } },
        },
        orderBy: [HOUSE_FIRST_ORDER, { hourlyRate: 'asc' }],
        take: 2000,
      }),
      prisma.company.findUnique({
        where: { id: HOUSE_COMPANY_ID },
        select: { baseLat: true, baseLon: true, deliveryRadiusKm: true },
      }),
    ]);
    return { rows, house, loaded: true };
  } catch (error) {
    console.error('Failed to load the fleet for a city page', error);
    return { rows: [], house: null, loaded: false };
  }
}

// One query per category for a minute: generateMetadata and the page of one
// visit, and the pages of other cities rendered right after, share it.
const MEMO_MS = 60_000;
const memo = new Map<string, { at: number; value: Promise<CategoryFleet> }>();

function loadCategoryFleet(categorySlug: string): Promise<CategoryFleet> {
  const hit = memo.get(categorySlug);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const value = queryCategoryFleet(categorySlug);
  memo.set(categorySlug, { at: Date.now(), value });
  // A failed read is not kept: the next page tries the database again.
  void value.then((fleet) => {
    if (!fleet.loaded && memo.get(categorySlug)?.value === value) memo.delete(categorySlug);
  });
  return value;
}

/** The honest model of /arenda/<slug>/<city> (lib/cities.ts cityOffer). */
export async function loadCityOffer(landing: Landing, city: City): Promise<CityOffer> {
  const { rows, house, loaded } = await loadCategoryFleet(landing.categorySlug);
  return cityOffer(landing, city, rows, houseArea(house), loaded);
}
