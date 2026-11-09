// Which public route may show a prospect (R11–R13), and the loaders of the
// three routes. The loaders select only what a page renders: no id, token,
// note, e-mail, Telegram or dates, so nothing of that can end up in the markup
// by accident (R19). WhatsApp from the card is selected because the client's
// site shows its button (8.2), and the card's source — for the OpenStreetMap
// credit on the preview (К6). The token itself
// is read from the URL and never selected back. The owner's edits of a site
// (`siteJson`, S5) and the client's own domain (S7) are public by nature: they
// are what the site shows and where it lives.
import { prisma } from '@specai/database';
import { domainKeys, normalizeHost } from './domains';
import type { Niche } from './niches';
import { buildSitePage, type SitePage } from './pages';
import type { PageNiche, PageProspect } from './pageTypes';
import { applySiteContent, parseSiteContent } from './siteContent';

export type PublicRoute = 'preview' | 'site' | 'provider';

/** The slug of a published page: `/s/<slug>`, `/p/<slug>`. */
export const SLUG_RE = /^[a-z0-9-]{3,80}$/;

/** The preview secret: 32 hex characters (16 random bytes). */
export const TOKEN_RE = /^[a-f0-9]{32}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function isValidToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/**
 * preview — any status but DECLINED (the owner opens it by the secret link);
 * site — a site prospect once PUBLISHED;
 * provider — a provider prospect once PUBLISHED, or REGISTERED (the company
 * signed up from its page and the page stays).
 */
export function visibleFor(p: { kind: string; status: string }, route: PublicRoute): boolean {
  switch (route) {
    case 'preview':
      return p.status !== 'DECLINED';
    case 'site':
      return p.kind === 'site' && p.status === 'PUBLISHED';
    case 'provider':
      return p.kind === 'provider' && (p.status === 'PUBLISHED' || p.status === 'REGISTERED');
    default:
      return false;
  }
}

/** The niche dictionary entry as the page builders take it (a mutable copy of the services). */
export function toPageNiche(n: Niche): PageNiche {
  return {
    key: n.key,
    title: n.title,
    services: [...n.services],
    heroLine: n.heroLine,
    accent: n.accent,
  };
}

/** A prospect as the pages need it: the builders' input plus the niche key, the edits and the domain. */
export type ProspectPageRow = PageProspect & {
  niche: string;
  /** The owner's edits of the site (lib/office/siteContent.ts), JSON; null — as the card. */
  siteJson: string | null;
  /** The client's own domain («ulybka-kazan.ru»), null — only /s/<slug>. */
  domain: string | null;
};

const PAGE_SELECT = {
  kind: true,
  status: true,
  slug: true,
  name: true,
  phone: true,
  address: true,
  city: true,
  lat: true,
  lon: true,
  niche: true,
  tags: true,
  hours: true,
  siteJson: true,
  domain: true,
  whatsapp: true,
  source: true,
} as const;

function narrow(row: {
  kind: string;
  status: string;
  slug: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  niche: string;
  tags: string | null;
  hours: string | null;
  siteJson: string | null;
  domain: string | null;
  whatsapp: string | null;
  source: string | null;
}): ProspectPageRow | null {
  if (row.kind !== 'site' && row.kind !== 'provider') return null;
  return {
    kind: row.kind,
    status: row.status,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    lat: row.lat,
    lon: row.lon,
    niche: row.niche,
    tags: row.tags,
    hours: row.hours,
    siteJson: row.siteJson,
    domain: row.domain,
    whatsapp: row.whatsapp,
    source: row.source,
  };
}

export async function loadProspectBySlug(slug: string): Promise<ProspectPageRow | null> {
  if (!isValidSlug(slug)) return null;
  const row = await prisma.prospect.findUnique({ where: { slug }, select: PAGE_SELECT });
  return row ? narrow(row) : null;
}

export async function loadProspectByToken(token: string): Promise<ProspectPageRow | null> {
  if (!isValidToken(token)) return null;
  const row = await prisma.prospect.findUnique({ where: { token }, select: PAGE_SELECT });
  return row ? narrow(row) : null;
}

/** The client's site as /s and /preview show it: the card's page with the owner's edits on top (S5). */
export function sitePageFor(row: ProspectPageRow, niche: PageNiche): SitePage {
  return applySiteContent(buildSitePage(row, niche), parseSiteContent(row.siteJson));
}

/**
 * Where a client's site lives (S7): on the client's own domain when the request came through
 * it (the middleware passes the host as `x-client-domain`) and it is this site's domain;
 * otherwise /s/<slug> on the platform. A header naming any other host is ignored, so it
 * cannot point the canonical of one site at another address.
 * `canonical` goes to the metadata (relative paths resolve against `metadataBase`),
 * `url` is absolute (structured data).
 */
export function clientSiteAddress(
  p: { slug: string; domain: string | null },
  requestDomain: string | null | undefined,
  base: string,
): { canonical: string; url: string } {
  const host = normalizeHost(requestDomain);
  const [bare, ...aliases] = p.domain ? domainKeys(p.domain) : [];
  if (host && bare && (host === bare || aliases.includes(host))) {
    const url = `https://${bare}/`;
    return { canonical: url, url };
  }
  const path = `/s/${encodeURIComponent(p.slug)}`;
  return { canonical: path, url: `${base.replace(/\/+$/, '')}${path}` };
}

/** Published office pages in the sitemap (S11): the same rules as `visibleFor`. */
export const SITEMAP_PROSPECT_WHERE = {
  OR: [
    { kind: 'site', status: 'PUBLISHED' },
    { kind: 'provider', status: { in: ['PUBLISHED', 'REGISTERED'] } },
  ],
};

/** Sitemap paths of the published office pages; anything not public is dropped. */
export function officeSitemapEntries(
  rows: readonly { kind: string; status: string; slug: string; updatedAt: Date }[],
): { path: string; lastModified: Date }[] {
  const out: { path: string; lastModified: Date }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isValidSlug(row.slug)) continue;
    const route = visibleFor(row, 'site') ? 's' : visibleFor(row, 'provider') ? 'p' : null;
    if (!route) continue;
    const path = `/${route}/${row.slug}`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, lastModified: row.updatedAt });
  }
  return out;
}
