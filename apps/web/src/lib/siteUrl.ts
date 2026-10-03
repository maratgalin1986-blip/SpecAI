// Absolute site URL for metadata, sitemap and social previews.
// Set NEXT_PUBLIC_SITE_URL once the site has its own domain.
export function siteUrl() {
  const set = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (set) return set.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return 'http://localhost:3000';
}
