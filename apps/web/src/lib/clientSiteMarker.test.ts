import { describe, expect, it } from 'vitest';
import { CLIENT_SITE_SELECTOR, hasClientSiteMarker, offPlatformPage } from './clientSiteMarker';

const doc = (found: boolean) => ({
  querySelector: (selector: string) => (found && selector === CLIENT_SITE_SELECTOR ? {} : null),
});

describe('clientSiteMarker', () => {
  it('маркер находится по атрибуту data-client-site', () => {
    expect(CLIENT_SITE_SELECTOR).toBe('[data-client-site]');
    expect(hasClientSiteMarker(doc(true))).toBe(true);
    expect(hasClientSiteMarker(doc(false))).toBe(false);
  });

  it('без документа и при ошибке поиска — не клиентский сайт', () => {
    expect(hasClientSiteMarker(null)).toBe(false);
    expect(hasClientSiteMarker(undefined)).toBe(false);
    expect(
      hasClientSiteMarker({
        querySelector: () => {
          throw new Error('bad selector');
        },
      }),
    ).toBe(false);
  });

  it('страница офиса по пути или клиентский сайт на своём домене — эффекты выключены', () => {
    expect(offPlatformPage(true, doc(false))).toBe(true);
    expect(offPlatformPage(false, doc(true))).toBe(true);
    expect(offPlatformPage(false, doc(false))).toBe(false);
    expect(offPlatformPage(false, null)).toBe(false);
  });
});

describe('страница /s/[slug]', () => {
  it('ставит маркер клиентского сайта в разметку', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../app/s/[slug]/page.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/<div data-client-site hidden \/>/);
  });
});
