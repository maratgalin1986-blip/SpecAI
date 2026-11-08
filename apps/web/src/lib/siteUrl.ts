// Absolute site URL for metadata, sitemap, robots, share links, QR codes and
// links in notifications.
//
// The main domain is иистройка24.рф (owner, 2026-10-23: «сюда всё переносим»;
// connected to Vercel 2026-10-24), and that is the default.
// NEXT_PUBLIC_SITE_URL overrides it (e.g. a staging host). The old address
// spec-ai-web.vercel.app keeps serving the API for the app; its pages send
// visitors to the domain (middleware.ts). iistroyka24.ru and iistroyka.ru are
// bought but not connected yet, so an override or a Vercel production domain
// on those hosts is ignored until NEXT_PUBLIC_SITE_DOMAIN_CONNECTED=1.

/** иистройка24.рф as browsers send it (punycode). */
export const MAIN_DOMAIN_HOST = 'xn--24-6kc5aagh4arjl.xn--p1ai';

export const DEFAULT_SITE_URL = `https://${MAIN_DOMAIN_HOST}`;

/** The first address of the site: still the app's API, pages move to the domain. */
export const LEGACY_SITE_HOST = 'spec-ai-web.vercel.app';

/** Bought domains that do not serve the site yet. */
export const PENDING_DOMAINS = ['iistroyka24.ru', 'iistroyka.ru'];

/**
 * Where a page request on the old address goes: the same path and query on the
 * main domain. Only production pages of the old host; null otherwise.
 */
export function legacyRedirectTarget(
  host: string | null,
  pathAndQuery: string,
  vercelEnv: string | undefined,
): string | null {
  if (vercelEnv !== 'production') return null;
  const bare = host?.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (bare !== LEGACY_SITE_HOST) return null;
  return `${DEFAULT_SITE_URL}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`;
}

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
