// The public page of a provider company (/providers/[id]): the JSON-LD
// LocalBusiness card for search engines and the description for meta tags.
// No phone or site of the provider: contacts open only after a confirmed
// booking (CLAUDE.md), so search engines get the page, not the phone.
// Pure, unit-tested.

export interface ProviderSeoInput {
  id: string;
  name: string;
  description?: string | null;
  baseAddress?: string | null;
  baseLat?: number | null;
  baseLon?: number | null;
  rating: number | null;
  ratingCount: number;
  machines: { name: string; category: string }[];
  city: string;
  region: string;
}

export function providerPath(id: string): string {
  return `/providers/${encodeURIComponent(id)}`;
}

/** Up to 160 characters for <meta name="description">. */
export function providerMetaDescription(p: ProviderSeoInput): string {
  const categories = [...new Set(p.machines.map((m) => m.category))].slice(0, 4);
  const parts = [
    `${p.name} — аренда спецтехники с машинистом`,
    categories.length ? categories.join(', ').toLowerCase() : null,
    p.baseAddress ? `база: ${p.baseAddress}` : p.city,
    p.rating !== null ? `рейтинг ${p.rating.toFixed(1)}` : null,
    'заявка бесплатно',
  ].filter(Boolean);
  const text = parts.join(' · ');
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export function providerJsonLd(p: ProviderSeoInput, base: string): Record<string, unknown> {
  const url = `${base.replace(/\/$/, '')}${providerPath(p.id)}`;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url,
    name: p.name,
    url,
    description: p.description?.trim() || providerMetaDescription(p),
    areaServed: p.region,
    address: {
      '@type': 'PostalAddress',
      ...(p.baseAddress ? { streetAddress: p.baseAddress } : {}),
      addressLocality: p.city,
      addressRegion: p.region,
      addressCountry: 'RU',
    },
  };
  if (p.baseLat != null && p.baseLon != null) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: p.baseLat, longitude: p.baseLon };
  }
  if (p.rating !== null && p.ratingCount > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: p.rating.toFixed(1),
      reviewCount: p.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  if (p.machines.length > 0) {
    ld.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Аренда спецтехники',
      itemListElement: p.machines.slice(0, 30).map((m) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: `Аренда: ${m.name}`, category: m.category },
      })),
    };
  }
  return ld;
}

/** JSON for a <script type="application/ld+json">, safe against «</script>». */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
