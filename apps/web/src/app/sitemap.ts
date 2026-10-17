import type { MetadataRoute } from 'next';
import { prisma } from '@specai/database';
import { LANDINGS } from '@/lib/landings';
import { cityBySlug, cityPages, cityPath } from '@/lib/cities';
import { loadCityOffer } from '@/lib/cityFleetData';
import { JOBS } from '@/lib/jobs';
import { siteUrl } from '@/lib/siteUrl';
import { PUBLIC_FLEET } from '@/lib/fleet';
import { providerPath } from '@/lib/providerSeo';

export const revalidate = 3600;

async function servedCityPaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const page of cityPages()) {
    const landing = LANDINGS.find((item) => item.slug === page.slug);
    const city = cityBySlug(page.city);
    if (!landing || !city) continue;
    const offer = await loadCityOffer(landing, city).catch(() => null);
    if (offer?.kind === 'available') paths.push(cityPath(page.slug, page.city));
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
  return [
    ...staticPages.map((path) => ({
      url: `${base}${path}`,
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
  ];
}
