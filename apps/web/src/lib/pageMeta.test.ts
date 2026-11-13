import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cityBySlug, cityPages, cityPageText } from './cities';
import { JOBS, jobRate } from './jobs';
import { LANDINGS } from './landings';
import {
  BRAND,
  DEFAULT_OG_IMAGE,
  DESCRIPTION_MAX,
  fitDescription,
  fitTitle,
  HOME_DESCRIPTION,
  HOME_TITLE,
  pageMeta,
  pickTitle,
  TITLE_MAX,
} from './pageMeta';
import { fromPerHour, fromPrice } from './prices';
import { SITE } from './site';

const page = (route: string) =>
  readFileSync(fileURLToPath(new URL(`../app${route}/page.tsx`, import.meta.url)), 'utf8');

/** The sitemap's static pages and the dynamic ones (app/sitemap.ts), minus the office's own. */
const PUBLIC_PAGES = [
  '',
  '/arenda',
  '/arenda/[slug]',
  '/arenda/[slug]/[city]',
  '/raboty',
  '/raboty/[slug]',
  '/ceny',
  '/ceny/opros',
  '/equipment',
  '/equipment/[id]',
  '/map',
  '/orders',
  '/providers',
  '/providers/[id]',
  '/agents',
  '/contacts',
  '/privacy',
  '/pravila',
  '/kak-polzovatsya',
  '/predlozheniya',
  '/bot',
  '/uborka-snega',
];

describe('fitTitle', () => {
  it('adds the full brand while the title stays within the limit', () => {
    expect(fitTitle('Контакты')).toBe(`Контакты · ${BRAND}`);
  });

  it('shortens the brand, then drops it, and never cuts the wording', () => {
    const medium = 'Исполнители — компании со своей спецтехникой';
    expect(fitTitle(medium)).toBe(`${medium} · ${SITE.platform}`);
    const long = 'Работы спецтехникой в Набережных Челнах — цены с машинистом';
    expect(fitTitle(long)).toBe(long);
    for (const title of [medium, long])
      expect(fitTitle(title).length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('does not repeat the brand a title already has', () => {
    expect(fitTitle(`${SITE.platform} в Telegram`)).toBe(`${SITE.platform} в Telegram`);
  });
});

describe('fitDescription', () => {
  it('keeps a short text as it is', () => {
    expect(fitDescription('  Короткий   текст. ')).toBe('Короткий текст.');
  });

  it('drops whole sentences, so no fact or price is reworded', () => {
    const text =
      'Копаем траншеи и котлованы, планируем участки, грузим грунт, работаем гидромолотом по бетону. ' +
      'Исполнители по всей России и парк СпецПласт16 в Набережных Челнах. +7 900 000-00-00';
    const out = fitDescription(text);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(text.startsWith(out)).toBe(true);
    expect(out.endsWith('.')).toBe(true);
  });

  it('cuts one long sentence by words with an ellipsis', () => {
    const out = fitDescription(`${'слово '.repeat(60)}конец.`);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(out).toMatch(/слово…$/);
  });

  it('does not break a price or a decimal number', () => {
    const out = fitDescription(
      `Цена от 2 500 ₽/час, смена 8 ч. ${'Подробности и условия. '.repeat(12)}`,
    );
    expect(out).toMatch(/^Цена от 2 500 ₽\/час, смена 8 ч\./);
  });
});

describe('pageMeta', () => {
  it('gives the page its own title, description, address and the site picture', () => {
    const meta = pageMeta('/contacts', { title: 'Контакты', description: 'Телефон и почта.' });
    expect(meta.title).toEqual({ absolute: `Контакты · ${BRAND}` });
    expect(meta.alternates?.canonical).toBe('/contacts');
    expect(meta.openGraph).toMatchObject({
      title: 'Контакты',
      description: 'Телефон и почта.',
      url: '/contacts',
      images: [DEFAULT_OG_IMAGE],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', title: 'Контакты' });
  });

  it("uses the page's own picture and keeps other fields", () => {
    const meta = pageMeta('/equipment/1', {
      title: 'JCB 4CX',
      description: 'Экскаватор-погрузчик.',
      image: { url: 'https://cdn.example/jcb.jpg', alt: 'JCB 4CX' },
      robots: { index: false },
    });
    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.example/jcb.jpg', alt: 'JCB 4CX' },
    ]);
    expect(meta.robots).toEqual({ index: false });
  });

  it('falls back to the site title and a short description', () => {
    const meta = pageMeta('/');
    expect(meta.title).toEqual({ absolute: HOME_TITLE });
    expect(HOME_TITLE.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(HOME_TITLE).toContain(SITE.platform);
    expect(HOME_TITLE).toContain(SITE.tagline);
    expect(meta.description).toBe(HOME_DESCRIPTION);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(meta.openGraph?.url).toBe('/');
  });
});

describe('public pages', () => {
  it('build their metadata with pageMeta (own og:title, og:url and og:image)', () => {
    for (const route of PUBLIC_PAGES) expect(page(route), route || '/').toMatch(/\bpageMeta\(/);
  });

  it('have static titles within the limit', () => {
    for (const route of PUBLIC_PAGES) {
      // `title: '…'` with a plain string: the pages whose title is not computed.
      const title = /pageMeta\([^)]*?\{\s*(?:\/\/[^\n]*\s*)*title: '([^']+)'/.exec(
        page(route),
      )?.[1];
      if (title) expect(fitTitle(title).length, title).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it('fit every landing title, with a five-digit price too', () => {
    for (const landing of LANDINGS) {
      for (const price of [fromPerHour(landing.machine), fromPerHour(12500)]) {
        const title = pickTitle(
          `Аренда ${landing.title} по всей России — ${price}`,
          `Аренда ${landing.title} — ${price}`,
          `Аренда ${landing.title} — ${price.replace(/ с\u00a0машинистом$/, '')}`,
        );
        expect(fitTitle(title).length, title).toBeLessThanOrEqual(TITLE_MAX);
      }
    }
  });

  it('fit every job title', () => {
    for (const job of JOBS) {
      const title = pickTitle(
        `${job.name} в Набережных Челнах — ${fromPerHour(jobRate(job))}`,
        `${job.name} в Набережных Челнах — ${fromPrice(jobRate(job))}`,
      );
      expect(fitTitle(title).length, title).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it('fit every city page title once the price tail is dropped', () => {
    for (const { slug, city: citySlug } of cityPages()) {
      const landing = LANDINGS.find((item) => item.slug === slug)!;
      const city = cityBySlug(citySlug)!;
      const text = cityPageText(landing, city, { kind: 'empty' } as never);
      const title = pickTitle(
        text.title,
        text.title.replace(/ — [^—]*$/, ''),
        `${landing.short} ${city.inCity}`,
      );
      expect(fitTitle(title).length, title).toBeLessThanOrEqual(TITLE_MAX);
    }
  });
});
