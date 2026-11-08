import { siteUrl } from '@/lib/siteUrl';

/** Where this site serves the uploads it keeps in its own database (lib/fileStore.ts). */
export const FILES_PATH = '/api/files/';

/**
 * The site's own addresses, now and planned: a link saved under one of them
 * stays «ours» when the site moves to its domain (иистройка24.рф, iistroyka24.ru
 * and iistroyka.ru are bought; иистройка24.рф serves the site since 2026-10-24).
 */
function ownHosts(): Set<string> {
  const hosts = new Set([
    'spec-ai-web.vercel.app',
    // иистройка24.рф as the URL parser gives it (siteUrl.ts: MAIN_DOMAIN_HOST).
    'xn--24-6kc5aagh4arjl.xn--p1ai',
    'iistroyka24.ru',
    'iistroyka.ru',
  ]);
  try {
    hosts.add(new URL(siteUrl()).host);
  } catch {
    /* no site URL: the known ones */
  }
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) hosts.add(production);
  for (const host of [...hosts]) if (!host.startsWith('www.')) hosts.add(`www.${host}`);
  return hosts;
}

/** The key of a file this site stores itself, from its URL; null for any other URL. */
export function storedKeyFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ownHosts().has(url.host)) return null;
  if (!url.pathname.startsWith(FILES_PATH)) return null;
  try {
    const key = decodeURIComponent(url.pathname.slice(FILES_PATH.length));
    return key && !key.includes('..') ? key : null;
  } catch {
    return null;
  }
}
