import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, resolveSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('uses an explicit working address', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.org/' })).toBe(
      'https://example.org',
    );
  });

  it('ignores the bought but unconnected domains', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://iistroyka.ru',
        VERCEL: '1',
        VERCEL_PROJECT_PRODUCTION_URL: 'iistroyka.ru',
      }),
    ).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://www.iistroyka24.ru/' })).toBe(
      DEFAULT_SITE_URL,
    );
  });

  it('falls back to the Vercel production host when it is not a pending domain', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://iistroyka.ru',
        VERCEL_PROJECT_PRODUCTION_URL: 'spec-ai-web.vercel.app',
      }),
    ).toBe('https://spec-ai-web.vercel.app');
  });

  it('honours the domain once it is marked connected', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://iistroyka24.ru',
        NEXT_PUBLIC_SITE_DOMAIN_CONNECTED: '1',
      }),
    ).toBe('https://iistroyka24.ru');
  });

  it('defaults to the Vercel address on Vercel and to localhost elsewhere', () => {
    expect(resolveSiteUrl({ VERCEL: '1' })).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });

  it('ignores blank values', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '   ', VERCEL: '1' })).toBe(DEFAULT_SITE_URL);
  });
});
