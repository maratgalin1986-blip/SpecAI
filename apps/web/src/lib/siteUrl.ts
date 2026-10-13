// Absolute site URL for metadata, sitemap, robots, share links, QR codes and
// links in notifications.
//
// The site lives on spec-ai-web.vercel.app. iistroyka24.ru and iistroyka.ru
// are bought but not connected (a registrar parking page answers there), so a
// NEXT_PUBLIC_SITE_URL or Vercel production domain on those hosts is ignored
// until NEXT_PUBLIC_SITE_DOMAIN_CONNECTED=1 says the DNS points at Vercel.

export const DEFAULT_SITE_URL = 'https://spec-ai-web.vercel.app';

/** Bought domains that do not serve the site yet. */
export const PENDING_DOMAINS = ['iistroyka24.ru', 'iistroyka.ru'];

type SiteEnv = Partial<
  Record<
    | 'NEXT_PUBLIC_SITE_URL'
    | 'NEXT_PUBLIC_SITE_DOMAIN_CONNECTED'
    | 'VERCEL'
    | 'VERCEL_PROJECT_PRODUCTION_URL',
    string
  >
>;

function normalize(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isPending(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  return PENDING_DOMAINS.includes(host);
}

/** Pure resolver, exported for tests. */
export function resolveSiteUrl(env: SiteEnv): string {
  const connected = env.NEXT_PUBLIC_SITE_DOMAIN_CONNECTED?.trim() === '1';
  const candidates = [
    normalize(env.NEXT_PUBLIC_SITE_URL),
    normalize(env.VERCEL_PROJECT_PRODUCTION_URL),
  ];
  for (const url of candidates) {
    if (url && (connected || !isPending(url))) return url;
  }
  // On Vercel (production and previews) fall back to the working address;
  // locally keep links on the dev server.
  if (env.VERCEL || env.VERCEL_PROJECT_PRODUCTION_URL || env.NEXT_PUBLIC_SITE_URL) {
    return DEFAULT_SITE_URL;
  }
  return 'http://localhost:3000';
}

export function siteUrl() {
  return resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SITE_DOMAIN_CONNECTED: process.env.NEXT_PUBLIC_SITE_DOMAIN_CONNECTED,
    VERCEL: process.env.VERCEL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
}
