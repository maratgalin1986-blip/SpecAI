import { describe, expect, it } from 'vitest';
import type { PageNiche } from './pageTypes';
import {
  SITEMAP_PROSPECT_WHERE,
  clientSiteAddress,
  isValidSlug,
  isValidToken,
  officeSitemapEntries,
  sitePageFor,
  visibleFor,
  type ProspectPageRow,
} from './visibility';

const STATUSES = [
  'NEW',
  'READY',
  'CONTACTED',
  'CALLBACK',
  'AGREED',
  'PUBLISHED',
  'DECLINED',
  'REGISTERED',
] as const;

describe('visibleFor', () => {
  it('preview: every status but DECLINED, whatever the kind', () => {
    for (const kind of ['site', 'provider']) {
      for (const status of STATUSES) {
        expect(visibleFor({ kind, status }, 'preview')).toBe(status !== 'DECLINED');
      }
    }
  });

  it('site: only a site prospect that is PUBLISHED', () => {
    for (const status of STATUSES) {
      expect(visibleFor({ kind: 'site', status }, 'site')).toBe(status === 'PUBLISHED');
      expect(visibleFor({ kind: 'provider', status }, 'site')).toBe(false);
    }
  });

  it('provider: a provider prospect that is PUBLISHED or REGISTERED', () => {
    for (const status of STATUSES) {
      expect(visibleFor({ kind: 'provider', status }, 'provider')).toBe(
        status === 'PUBLISHED' || status === 'REGISTERED',
      );
      expect(visibleFor({ kind: 'site', status }, 'provider')).toBe(false);
    }
  });

  it('a declined page is gone everywhere (R12)', () => {
    for (const route of ['preview', 'site', 'provider'] as const) {
      expect(visibleFor({ kind: 'site', status: 'DECLINED' }, route)).toBe(false);
      expect(visibleFor({ kind: 'provider', status: 'DECLINED' }, route)).toBe(false);
    }
  });

  it('an unknown kind is never public', () => {
    expect(visibleFor({ kind: 'other', status: 'PUBLISHED' }, 'site')).toBe(false);
    expect(visibleFor({ kind: 'other', status: 'PUBLISHED' }, 'provider')).toBe(false);
  });
});

describe('route parameters', () => {
  it('accepts a slug of 3–80 lower-case letters, digits and hyphens', () => {
    expect(isValidSlug('ulybka-kazan')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('a'.repeat(80))).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(81))).toBe(false);
    expect(isValidSlug('Ulybka')).toBe(false);
    expect(isValidSlug('улыбка')).toBe(false);
    expect(isValidSlug('a_b')).toBe(false);
    expect(isValidSlug('a/b')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('accepts a token of exactly 32 lower-case hex characters', () => {
    expect(isValidToken('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isValidToken('0123456789ABCDEF0123456789ABCDEF')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcde')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcdef0')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcdeg')).toBe(false);
    expect(isValidToken('')).toBe(false);
  });
});

const niche: PageNiche = {
  key: 'dentist',
  title: 'Стоматология',
  services: ['Лечение кариеса', 'Чистка зубов'],
  heroLine: 'Лечение зубов без боли в городе {city}',
  accent: 'teal',
};

const row: ProspectPageRow = {
  kind: 'site',
  status: 'PUBLISHED',
  slug: 'ulybka-kazan',
  name: 'Улыбка',
  phone: '+7 (843) 212-34-56',
  address: 'Казань, ул. Баумана, 1',
  city: 'Казань',
  lat: 55.7887,
  lon: 49.1221,
  tags: null,
  hours: 'Пн–Пт 9:00–18:00',
  niche: 'dentist',
  siteJson: null,
  domain: null,
};

describe('sitePageFor', () => {
  it('without edits — the page from the card: no about, no photos, no WhatsApp, the form off (К10)', () => {
    const page = sitePageFor(row, niche);
    expect(page.title).toBe('Улыбка');
    expect(page.hero).toBe('Лечение зубов без боли в городе Казань');
    expect(page.about).toBeNull();
    expect(page.photos).toEqual([]);
    expect(page.leadForm).toBe(false);
    expect(page.whatsappHref).toBeNull();
    expect(sitePageFor({ ...row, whatsapp: '+79272428088' }, niche).whatsappHref).toBe(
      'https://wa.me/79272428088',
    );
  });

  it("the owner's edits go on top of the card (S5)", () => {
    const page = sitePageFor(
      {
        ...row,
        siteJson: JSON.stringify({
          title: 'Улыбка на Баумана',
          about: 'Работаем с 2010 года.',
          services: ['Имплантация'],
          photos: ['/api/files/office/a.jpg'],
          accent: 'sky',
          leadForm: false,
        }),
      },
      niche,
    );
    expect(page.title).toBe('Улыбка на Баумана');
    expect(page.about).toBe('Работаем с 2010 года.');
    expect(page.services).toEqual(['Имплантация']);
    expect(page.photos).toEqual(['/api/files/office/a.jpg']);
    expect(page.accent).toBe('sky');
    expect(page.leadForm).toBe(false);
    // What was not edited stays as on the card.
    expect(page.hours).toBe('Пн–Пт 9:00–18:00');
  });

  it('broken JSON or a foreign picture does not break the page', () => {
    expect(sitePageFor({ ...row, siteJson: '{not json' }, niche).title).toBe('Улыбка');
    const foreign = sitePageFor(
      { ...row, siteJson: JSON.stringify({ photos: ['https://evil.example/x.jpg'] }) },
      niche,
    );
    expect(foreign.photos).toEqual([]);
  });
});

describe('clientSiteAddress', () => {
  const base = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';

  it('on the platform: /s/<slug>, absolute url on the platform', () => {
    expect(clientSiteAddress(row, null, base)).toEqual({
      canonical: '/s/ulybka-kazan',
      url: `${base}/s/ulybka-kazan`,
    });
    expect(clientSiteAddress({ ...row, domain: 'ulybka-kazan.ru' }, null, `${base}/`).url).toBe(
      `${base}/s/ulybka-kazan`,
    );
  });

  it("through the client's own domain (with or without www): that domain", () => {
    const withDomain = { ...row, domain: 'ulybka-kazan.ru' };
    for (const host of ['ulybka-kazan.ru', 'www.ulybka-kazan.ru', 'WWW.Ulybka-Kazan.ru:443']) {
      expect(clientSiteAddress(withDomain, host, base)).toEqual({
        canonical: 'https://ulybka-kazan.ru/',
        url: 'https://ulybka-kazan.ru/',
      });
    }
  });

  it('a header with another host or without a domain on the site is ignored', () => {
    expect(
      clientSiteAddress({ ...row, domain: 'ulybka-kazan.ru' }, 'evil.example', base).canonical,
    ).toBe('/s/ulybka-kazan');
    expect(clientSiteAddress(row, 'ulybka-kazan.ru', base).canonical).toBe('/s/ulybka-kazan');
    expect(clientSiteAddress({ ...row, domain: 'ulybka-kazan.ru' }, '', base).canonical).toBe(
      '/s/ulybka-kazan',
    );
  });
});

describe('officeSitemapEntries', () => {
  const at = new Date('2026-11-01T10:00:00Z');

  it('lists published sites under /s and public provider pages under /p', () => {
    const entries = officeSitemapEntries([
      { kind: 'site', status: 'PUBLISHED', slug: 'ulybka-kazan', updatedAt: at },
      { kind: 'provider', status: 'PUBLISHED', slug: 'kran-chelny', updatedAt: at },
      { kind: 'provider', status: 'REGISTERED', slug: 'ekskavator-ufa', updatedAt: at },
    ]);
    expect(entries).toEqual([
      { path: '/s/ulybka-kazan', lastModified: at },
      { path: '/p/kran-chelny', lastModified: at },
      { path: '/p/ekskavator-ufa', lastModified: at },
    ]);
  });

  it('drops what is not public, bad slugs and duplicates', () => {
    const entries = officeSitemapEntries([
      { kind: 'site', status: 'AGREED', slug: 'not-yet', updatedAt: at },
      { kind: 'site', status: 'REGISTERED', slug: 'site-registered', updatedAt: at },
      { kind: 'site', status: 'DECLINED', slug: 'declined', updatedAt: at },
      { kind: 'provider', status: 'CONTACTED', slug: 'contacted', updatedAt: at },
      { kind: 'other', status: 'PUBLISHED', slug: 'other-kind', updatedAt: at },
      { kind: 'site', status: 'PUBLISHED', slug: 'Bad/Slug', updatedAt: at },
      { kind: 'site', status: 'PUBLISHED', slug: 'twice', updatedAt: at },
      { kind: 'site', status: 'PUBLISHED', slug: 'twice', updatedAt: at },
    ]);
    expect(entries.map((e) => e.path)).toEqual(['/s/twice']);
  });

  it('the database filter asks for the same pages as visibleFor', () => {
    expect(SITEMAP_PROSPECT_WHERE.OR).toEqual([
      { kind: 'site', status: 'PUBLISHED' },
      { kind: 'provider', status: { in: ['PUBLISHED', 'REGISTERED'] } },
    ]);
  });
});
