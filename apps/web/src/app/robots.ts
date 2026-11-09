import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /preview: private previews of the office agents' pages (R11).
      disallow: ['/admin', '/api/', '/dashboard', '/login', '/preview'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
