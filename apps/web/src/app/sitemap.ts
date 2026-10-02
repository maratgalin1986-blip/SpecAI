import type { MetadataRoute } from 'next';
import { prisma } from '@specai/database';
import { LANDINGS } from '@/lib/landings';
import { siteUrl } from '@/lib/siteUrl';
import { PUBLIC_FLEET } from '@/lib/fleet';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = [
    '',
    ...LANDINGS.map((landing) => `/arenda/${landing.slug}`),
    '/equipment',
    '/map',
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
  ];
}
