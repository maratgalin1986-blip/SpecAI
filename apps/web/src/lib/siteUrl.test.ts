import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SITE_URL, resolveSiteUrl, siteUrl, usableSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('defaults to the working Vercel address', () => {
    expect(DEFAULT_SITE_URL).toBe('https://spec-ai-web.vercel.app');
    expect(resolveSiteUrl({})).toBe(DEFAULT_SITE_URL);
  });

  it('keeps the NEXT_PUBLIC_SITE_URL override', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.org/' })).toBe(
      'https://example.org',
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'staging.example.org' })).toBe(
      'https://staging.example.org',
    );
  });

  it('ignores the bought but unconnected domains', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://iistroyka.ru',
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

  it('ignores blank and malformed values', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '   ' })).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://' })).toBe(DEFAULT_SITE_URL);
  });
});

describe('usableSiteUrl', () => {
  it('drops pending domains and keeps working ones', () => {
    expect(usableSiteUrl('https://iistroyka.ru/')).toBeNull();
    expect(usableSiteUrl('http://localhost:3100/')).toBe('http://localhost:3100');
    expect(usableSiteUrl(undefined)).toBeNull();
  });
});

describe('siteUrl', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads the environment', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.NEXT_PUBLIC_SITE_DOMAIN_CONNECTED;
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    process.env.NEXT_PUBLIC_SITE_URL = 'https://iistroyka.ru';
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.org';
    expect(siteUrl()).toBe('https://example.org');
  });
});
