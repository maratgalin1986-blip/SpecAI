import type { MetadataRoute } from 'next';
import { prisma } from '@specai/database';
import { siteUrl } from '@/lib/siteUrl';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = [
    '',
    '/equipment',
    '/orders',
    '/agents',
    '/provider',
    '/contacts',
    '/privacy',
  ];
  const equipment = await prisma.equipment
    .findMany({ where: { status: { not: 'RETIRED' } }, select: { id: true, updatedAt: true } })
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
