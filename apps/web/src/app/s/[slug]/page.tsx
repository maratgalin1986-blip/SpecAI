import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { OfficeSitePage } from '@/components/office/OfficeSitePage';
import { nicheByKey } from '@/lib/office/niches';
import { phoneDigits, type SitePage } from '@/lib/office/pages';
import {
  clientSiteAddress,
  loadProspectBySlug,
  sitePageFor,
  toPageNiche,
  visibleFor,
} from '@/lib/office/visibility';
import { jsonLdScript } from '@/lib/providerSeo';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

// A company's published site (R12): only once the company agreed and the
// owner pressed «Опубликовать» (status PUBLISHED); before that and after a
// refusal the address answers 404. Indexed, with a LocalBusiness card. The
// owner's edits from the admin (S5) go on top of the card. The same page
// answers on the client's own domain (S7): the middleware rewrites it here and
// passes the host as `x-client-domain`; then the canonical is that domain.

/** The middleware's header with the client's host (S7, middleware.ts). */
const CLIENT_DOMAIN_HEADER = 'x-client-domain';

/**
 * This is the client's site, not a platform page: the platform's header, footer
 * and floating buttons (marked `data-platform-chrome`) and the opening curtain
 * are hidden, and the main column runs full width (app/s/layout.tsx takes off
 * its padding). Otherwise a visitor of a dentist's site would see the
 * machinery menu and write to СпецПласт16's messengers instead of the dentist.
 */
const HIDE_PLATFORM_CHROME =
  '[data-platform-chrome],.cine-curtain{display:none!important}main#content{max-width:none!important}';

async function loadSite(slug: string) {
  const prospect = await loadProspectBySlug(slug);
  if (!prospect || !visibleFor(prospect, 'site')) return null;
  const niche = nicheByKey(prospect.niche);
  if (!niche) return null;
  return {
    page: sitePageFor(prospect, toPageNiche(niche)),
    slug: prospect.slug,
    domain: prospect.domain,
    lat: prospect.lat,
    lon: prospect.lon,
  };
}

async function requestClientDomain(): Promise<string | null> {
  const h = await headers();
  return h.get(CLIENT_DOMAIN_HEADER);
}

function siteJsonLd(
  page: SitePage,
  coords: { lat: number | null; lon: number | null },
  url: string,
  base: string,
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url,
    name: page.title,
    url,
    description: page.hero,
    telephone: `+${phoneDigits(page.phone)}`,
    address: {
      '@type': 'PostalAddress',
      ...(page.address ? { streetAddress: page.address } : {}),
      ...(page.city ? { addressLocality: page.city } : {}),
      addressCountry: 'RU',
    },
  };
  if (coords.lat != null && coords.lon != null) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: coords.lat, longitude: coords.lon };
  }
  if (page.mapHref) ld.hasMap = page.mapHref;
  // Uploaded photos are served by the platform (/api/files/…) or Vercel Blob.
  if (page.photos.length) {
    ld.image = page.photos.map((src) => (src.startsWith('/') ? `${base}${src}` : src));
  }
  return ld;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const site = await loadSite(params.slug).catch(() => null);
  if (!site) return { title: 'Страница не найдена', robots: { index: false } };
  const { page } = site;
  const address = clientSiteAddress(site, await requestClientDomain(), siteUrl());
  const title = page.city ? `${page.title} — ${page.eyebrow}, ${page.city}` : page.title;
  return {
    // The client's own name, not the platform's title template.
    title: { absolute: title },
    description: page.hero,
    alternates: { canonical: address.canonical },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: page.title,
      title,
      description: page.hero,
      url: address.canonical,
      ...(page.photos[0] ? { images: [{ url: page.photos[0], alt: `Фото: ${page.title}` }] } : {}),
    },
  };
}

export default async function ClientSitePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const site = await loadSite(params.slug);
  if (!site) notFound();
  const base = siteUrl();
  const { url } = clientSiteAddress(site, await requestClientDomain(), base);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_PLATFORM_CHROME }} />
      {/* Marks a client's site for the platform's effects (lib/clientSiteMarker.ts): on the
          client's own domain the path is «/», so BrandPresence and the cinema look for this. */}
      <div data-client-site hidden />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(siteJsonLd(site.page, { lat: site.lat, lon: site.lon }, url, base)),
        }}
      />
      <OfficeSitePage page={site.page} slug={site.slug} mode="live" />
    </>
  );
}
