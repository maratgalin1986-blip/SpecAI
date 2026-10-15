// Absolute site URL for metadata, sitemap, robots, share links, QR codes and
// links in notifications.
//
// The site lives on https://spec-ai-web.vercel.app, and that is the default.
// NEXT_PUBLIC_SITE_URL overrides it (e.g. a staging host). iistroyka24.ru and
// iistroyka.ru are bought but not connected (a registrar parking page answers
// there), so an override or a Vercel production domain on those hosts is
// ignored until NEXT_PUBLIC_SITE_DOMAIN_CONNECTED=1 says the DNS points at
// Vercel.

export const DEFAULT_SITE_URL = 'https://spec-ai-web.vercel.app';

/** Bought domains that do not serve the site yet. */
export const PENDING_DOMAINS = ['iistroyka24.ru', 'iistroyka.ru'];

type SiteEnv = Partial<
  Record<
    'NEXT_PUBLIC_SITE_URL' | 'NEXT_PUBLIC_SITE_DOMAIN_CONNECTED' | 'VERCEL_PROJECT_PRODUCTION_URL',
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

/**
 * A configured address, normalised (no trailing slash), or null when it is
 * empty, malformed or one of the not yet connected domains.
 */
export function usableSiteUrl(raw: string | undefined, domainConnected = false): string | null {
  const url = normalize(raw);
  if (!url) return null;
  return domainConnected || !isPending(url) ? url : null;
}

/** Pure resolver, exported for tests. */
export function resolveSiteUrl(env: SiteEnv): string {
  const connected = env.NEXT_PUBLIC_SITE_DOMAIN_CONNECTED?.trim() === '1';
  return (
    usableSiteUrl(env.NEXT_PUBLIC_SITE_URL, connected) ??
    usableSiteUrl(env.VERCEL_PROJECT_PRODUCTION_URL, connected) ??
    DEFAULT_SITE_URL
  );
}

export function siteUrl() {
  return resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SITE_DOMAIN_CONNECTED: process.env.NEXT_PUBLIC_SITE_DOMAIN_CONNECTED,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
}
