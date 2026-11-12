import { OFERTA_PATH } from '@/lib/office/oferta';
import type { MetadataRoute } from 'next';
import { prisma } from '@specai/database';
import { LANDINGS } from '@/lib/landings';
import { cityBySlug, cityPages, cityPath } from '@/lib/cities';
import { loadCityOffers } from '@/lib/cityFleetData';
import { JOBS } from '@/lib/jobs';
import { siteUrl } from '@/lib/siteUrl';
import { PUBLIC_FLEET } from '@/lib/fleet';
import { providerPath } from '@/lib/providerSeo';
import { SERVICE_PAGE_PATH } from '@/lib/office/clientSite';
import { SITEMAP_PROSPECT_WHERE, officeSitemapEntries } from '@/lib/office/visibility';

export const revalidate = 3600;

/** When this release was built (next.config.mjs); the start of the server otherwise. */
const BUILD_DATE = new Date(process.env.NEXT_PUBLIC_BUILD_DATE ?? Date.now());

async function servedCityPaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const landing of LANDINGS) {
    const cities = cityPages()
      .filter((page) => page.slug === landing.slug)
      .map((page) => cityBySlug(page.city))
      .filter((city): city is NonNullable<typeof city> => Boolean(city));
    // One read per kind of machinery; without a database no city page is
    // listed this hour rather than a guess.
    const offers = await loadCityOffers(landing, cities).catch(() => null);
    if (!offers) return [];
    for (const city of cities) {
      if (offers.get(city.slug)?.kind === 'available')
        paths.push(cityPath(landing.slug, city.slug));
    }
  }
  return paths;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = [
    '',
    ...LANDINGS.map((landing) => `/arenda/${landing.slug}`),
    // City pages only where a provider really serves the city (the others are
    // noindex until then, see app/arenda/[slug]/[city]).
    ...(await servedCityPaths()),
    '/raboty',
    '/ceny',
    '/ceny/opros',
    ...JOBS.map((job) => `/raboty/${job.slug}`),
    '/equipment',
    '/map',
    '/orders',
    '/providers',
    '/agents',
    '/contacts',
    '/privacy',
    '/pravila',
    '/kak-polzovatsya',
    '/predlozheniya',
    '/bot',
    // «Сайт под ключ» (S2): indexed, though not in the main menu; its public offer (К9).
    SERVICE_PAGE_PATH,
    OFERTA_PATH,
  ];
  const equipment = await prisma.equipment
    .findMany({
      where: { ...PUBLIC_FLEET, status: { not: 'RETIRED' } },
      select: { id: true, updatedAt: true },
    })
    .catch(() => []);
  // Public pages of provider companies (/providers/[id]) with a fleet or a base.
  const providers = await prisma.company
    .findMany({
      where: {
        isProvider: true,
        OR: [{ equipment: { some: { status: { not: 'RETIRED' } } } }, { baseLat: { not: null } }],
      },
      select: { id: true, updatedAt: true },
      take: 5000,
    })
    .catch(() => []);
  // Published pages of the office (S11): clients' sites /s/<slug> and provider
  // pages /p/<slug>. Without a database they are left out this hour.
  const officePages = officeSitemapEntries(
    await prisma.prospect
      .findMany({
        where: SITEMAP_PROSPECT_WHERE,
        select: { kind: true, status: true, slug: true, updatedAt: true },
        orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
        take: 5000,
      })
      .catch(() => []),
  );
  return [
    ...staticPages.map((path) => ({
      url: `${base}${path}`,
      // Texts and prices of these pages change with a release.
      lastModified: BUILD_DATE,
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.7,
    })),
    ...equipment.map((item) => ({
      url: `${base}/equipment/${item.id}`,
      lastModified: item.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...providers.map((company) => ({
      url: `${base}${providerPath(company.id)}`,
      lastModified: company.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...officePages.map((entry) => ({
      url: `${base}${entry.path}`,
      lastModified: entry.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];
}
