import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPriceIndex, pricePageIndexable } from './priceIndex';
import { sitemapPages, type SitemapPagesInput } from './sitemapPages';

const input = (extra: Partial<SitemapPagesInput> = {}): SitemapPagesInput => ({
  cityPaths: ['/arenda/avtokran/naberezhnye-chelny'],
  landingPaths: ['/arenda/avtokran'],
  jobPaths: ['/raboty/kopka-transhei'],
  newestOpenOrderAt: new Date('2026-11-10T08:00:00Z'),
  pricesIndexable: true,
  extraPaths: [],
  ...extra,
});
const paths = (extra?: Partial<SitemapPagesInput>) => sitemapPages(input(extra)).map((p) => p.path);

describe('sitemapPages', () => {
  it('lists /orders only while the board has an open order', () => {
    expect(paths()).toContain('/orders');
    expect(paths({ newestOpenOrderAt: null })).not.toContain('/orders');
    // The database could not be read: the page stays indexable, so it is listed.
    expect(paths({ newestOpenOrderAt: undefined })).toContain('/orders');
  });

  it('lists /ceny only when the price page is open to search', () => {
    expect(paths()).toContain('/ceny');
    expect(paths({ pricesIndexable: false })).not.toContain('/ceny');
    // The survey page is listed either way.
    expect(paths({ pricesIndexable: false })).toContain('/ceny/opros');
  });

  it('gives lastmod only from a real date, never the build time', () => {
    const pages = sitemapPages(input());
    expect(pages.find((p) => p.path === '/orders')?.lastModified).toEqual(
      new Date('2026-11-10T08:00:00Z'),
    );
    for (const page of pages.filter((p) => p.path !== '/orders'))
      expect(page.lastModified, page.path).toBeUndefined();
    const source = readFileSync(join(__dirname, '..', 'app', 'sitemap.ts'), 'utf8');
    expect(source).not.toMatch(/BUILD_DATE|NEXT_PUBLIC_BUILD_DATE/);
  });

  it('lists the given city pages and no others', () => {
    const list = paths();
    expect(list.filter((p) => p.split('/').length === 4 && p.startsWith('/arenda/'))).toEqual([
      '/arenda/avtokran/naberezhnye-chelny',
    ]);
  });
});

describe('pricePageIndexable', () => {
  it('is false only for an index read without a single number', () => {
    expect(pricePageIndexable(buildPriceIndex([]), true)).toBe(false);
    expect(pricePageIndexable(buildPriceIndex([]), false)).toBe(true);
  });
});
