// The fixed pages of the sitemap (app/sitemap.ts), as a pure function so the
// rules are tested without a database:
// - /orders and /ceny are listed only while they are open to search (an empty
//   board and a price page without data carry `noindex`);
// - a page gets <lastmod> only from a real date in the data (the newest open
//   order for /orders). The build time is not a date of change: texts did not
//   change with every release, and a sitemap where everything is «changed
//   today» teaches search engines to ignore lastmod. No date — no lastmod.

export interface SitemapPage {
  path: string;
  lastModified?: Date;
}

export interface SitemapPagesInput {
  /** City pages open to search (cityPageIndexable). */
  cityPaths: readonly string[];
  landingPaths: readonly string[];
  jobPaths: readonly string[];
  /** The newest open order: null — the board is empty; undefined — not read. */
  newestOpenOrderAt: Date | null | undefined;
  /** pricePageIndexable for /ceny. */
  pricesIndexable: boolean;
  /** Pages of the office area that are listed (S2, К9), passed through as they are. */
  extraPaths: readonly string[];
}

export function sitemapPages(input: SitemapPagesInput): SitemapPage[] {
  const pages: SitemapPage[] = [
    { path: '' },
    { path: '/arenda' },
    ...input.landingPaths.map((path) => ({ path })),
    ...input.cityPaths.map((path) => ({ path })),
    { path: '/raboty' },
    ...(input.pricesIndexable ? [{ path: '/ceny' }] : []),
    { path: '/ceny/opros' },
    ...input.jobPaths.map((path) => ({ path })),
    { path: '/uborka-snega' },
    { path: '/equipment' },
    { path: '/map' },
  ];
  if (input.newestOpenOrderAt !== null) {
    pages.push(
      input.newestOpenOrderAt
        ? { path: '/orders', lastModified: input.newestOpenOrderAt }
        : { path: '/orders' },
    );
  }
  pages.push(
    ...[
      '/providers',
      '/agents',
      '/contacts',
      '/privacy',
      '/pravila',
      '/kak-polzovatsya',
      '/predlozheniya',
      '/bot',
      ...input.extraPaths,
    ].map((path) => ({ path })),
  );
  return pages;
}
