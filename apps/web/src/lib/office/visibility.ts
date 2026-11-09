// Which public route may show a prospect (R11–R13), and the loaders of the
// three routes. The loaders select only what a page renders: no id, token,
// note, contacts of the candidate (e-mail, WhatsApp, Telegram) or dates, so
// nothing of that can end up in the markup by accident (R19). The token itself
// is read from the URL and never selected back.
import { prisma } from '@specai/database';
import type { Niche } from './niches';
import type { PageNiche, PageProspect } from './pageTypes';

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

/** A prospect as the pages need it: the builders' input plus the niche key. */
export type ProspectPageRow = PageProspect & { niche: string };

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
