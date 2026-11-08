import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_URL,
  MAIN_DOMAIN_HOST,
  resolveSiteUrl,
  siteUrl,
  legacyRedirectTarget,
  usableSiteUrl,
} from './siteUrl';

describe('legacyRedirectTarget', () => {
  it('sends pages of the old address to the domain, path and query kept', () => {
    expect(
      legacyRedirectTarget('spec-ai-web.vercel.app', '/orders?utm_source=vk', 'production'),
    ).toBe('https://xn--24-6kc5aagh4arjl.xn--p1ai/orders?utm_source=vk');
    expect(legacyRedirectTarget('spec-ai-web.vercel.app.:443', '/', 'production')).toBe(
      'https://xn--24-6kc5aagh4arjl.xn--p1ai/',
    );
    expect(legacyRedirectTarget('SPEC-AI-WEB.vercel.app', '/', 'production')).toBe(
      'https://xn--24-6kc5aagh4arjl.xn--p1ai/',
    );
  });

  it('leaves the domain itself, previews and local runs alone', () => {
    expect(legacyRedirectTarget(MAIN_DOMAIN_HOST, '/', 'production')).toBeNull();
    expect(legacyRedirectTarget('spec-ai-web.vercel.app', '/', 'preview')).toBeNull();
    expect(
      legacyRedirectTarget('spec-ai-web-git-x-marat10.vercel.app', '/', 'production'),
    ).toBeNull();
    expect(legacyRedirectTarget('localhost:3000', '/', undefined)).toBeNull();
    expect(legacyRedirectTarget(null, '/', 'production')).toBeNull();
  });
});

describe('resolveSiteUrl', () => {
  it('defaults to иистройка24.рф, the main domain since 2026-10-24', () => {
    expect(DEFAULT_SITE_URL).toBe('https://xn--24-6kc5aagh4arjl.xn--p1ai');
    expect(new URL(DEFAULT_SITE_URL).hostname).toBe(new URL('https://иистройка24.рф').hostname);
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

  it('uses иистройка24.рф from the environment, in Cyrillic or in punycode', () => {
    expect(new URL('https://иистройка24.рф').hostname).toBe(MAIN_DOMAIN_HOST);
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://иистройка24.рф/' })).toBe(
      `https://${MAIN_DOMAIN_HOST}`,
    );
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: MAIN_DOMAIN_HOST })).toBe(
      `https://${MAIN_DOMAIN_HOST}`,
    );
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
