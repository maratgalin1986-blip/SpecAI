import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfficeSitePage } from '@/components/office/OfficeSitePage';
import { nicheByKey } from '@/lib/office/niches';
import { buildSitePage, phoneDigits, type SitePage } from '@/lib/office/pages';
import { loadProspectBySlug, toPageNiche, visibleFor } from '@/lib/office/visibility';
import { jsonLdScript } from '@/lib/providerSeo';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

// A company's published site (R12): only once the company agreed and the
// owner pressed «Опубликовать» (status PUBLISHED); before that and after a
// refusal the address answers 404. Indexed, with a LocalBusiness card.

async function loadSite(slug: string) {
  const prospect = await loadProspectBySlug(slug);
  if (!prospect || !visibleFor(prospect, 'site')) return null;
  const niche = nicheByKey(prospect.niche);
  if (!niche) return null;
  return {
    page: buildSitePage(prospect, toPageNiche(niche)),
    lat: prospect.lat,
    lon: prospect.lon,
  };
}

function sitePath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}`;
}

function siteJsonLd(
  page: SitePage,
  coords: { lat: number | null; lon: number | null },
  url: string,
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
  return ld;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const site = await loadSite(params.slug).catch(() => null);
  if (!site) return { title: 'Страница не найдена', robots: { index: false } };
  const { page } = site;
  const title = page.city ? `${page.title} — ${page.eyebrow}, ${page.city}` : page.title;
  return {
    // The client's own name, not the platform's title template.
    title: { absolute: title },
    description: page.hero,
    alternates: { canonical: sitePath(params.slug) },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: page.title,
      title,
      description: page.hero,
      url: sitePath(params.slug),
    },
  };
}

export default async function ClientSitePage({ params }: { params: { slug: string } }) {
  const site = await loadSite(params.slug);
  if (!site) notFound();
  const url = `${siteUrl()}${sitePath(params.slug)}`;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(siteJsonLd(site.page, { lat: site.lat, lon: site.lon }, url)),
        }}
      />
      <OfficeSitePage page={site.page} />
    </>
  );
}
