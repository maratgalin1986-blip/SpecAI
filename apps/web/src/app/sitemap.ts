import type { MetadataRoute } from 'next';
import { prisma } from '@specai/database';
import { LANDINGS } from '@/lib/landings';
import { siteUrl } from '@/lib/siteUrl';
import { PUBLIC_FLEET } from '@/lib/fleet';
import { providerPath } from '@/lib/providerSeo';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = [
    '',
    ...LANDINGS.map((landing) => `/arenda/${landing.slug}`),
    '/equipment',
    '/map',
    '/providers',
    '/agents',
    '/contacts',
    '/privacy',
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
