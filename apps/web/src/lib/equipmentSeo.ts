// Structured data of a machine's public page (/equipment/<id>): schema.org
// Product with an Offer. The price is the one the page shows (customerRates →
// headlinePrices), never a separate number.

export interface EquipmentSeoInput {
  id: string;
  name: string;
  category: string;
  description: string | null;
  /** The provider company as the page names it. */
  seller: string;
  /** The hourly rate shown on the page; null when the machine has none. */
  hour: number | null;
  /** The shift rate shown on the page. */
  shift: number | null;
  currency: string;
  status: string;
  photos: string[];
  rating: number | null;
  reviews: number;
}

export function equipmentJsonLd(
  item: EquipmentSeoInput,
  base: string,
): Record<string, unknown> | null {
  const price = item.hour && item.hour > 0 ? item.hour : item.shift;
  // No price on the page — no Offer, and a Product without one is of no use.
  if (!price || price <= 0) return null;
  const url = `${base.replace(/\/$/, '')}/equipment/${item.id}`;
  const absolute = (src: string) =>
    src.startsWith('/') ? `${base.replace(/\/$/, '')}${src}` : src;
  const hourly = price === item.hour;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url,
    name: item.name,
    category: item.category,
    description:
      item.description?.trim() || `${item.name}: ${item.category.toLowerCase()} с машинистом`,
    url,
    ...(item.photos.length ? { image: item.photos.slice(0, 5).map(absolute) } : {}),
    brand: { '@type': 'Organization', name: item.seller },
    ...(item.rating !== null && item.reviews > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(item.rating.toFixed(1)),
            reviewCount: item.reviews,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      price: Math.round(price),
      priceCurrency: item.currency,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: Math.round(price),
        priceCurrency: item.currency,
        unitText: hourly ? 'час' : 'смена',
      },
      availability:
        item.status === 'AVAILABLE'
          ? 'https://schema.org/InStock'
          : item.status === 'RETIRED'
            ? 'https://schema.org/Discontinued'
            : 'https://schema.org/LimitedAvailability',
      seller: { '@type': 'Organization', name: item.seller },
    },
  };
}
