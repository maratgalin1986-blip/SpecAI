import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /preview: private previews of the office agents' pages (R11);
      // /oplata: a client's invoice for a site, by its secret link (S6).
      disallow: ['/admin', '/api/', '/dashboard', '/login', '/preview', '/oplata'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
