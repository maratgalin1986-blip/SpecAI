import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CITIES,
  cityBySlug,
  cityPages,
  cityPageText,
  cityPath,
  NEARBY_CITIES,
  shiftExample,
} from './cities';
import { landingBySlug, LANDINGS } from './landings';
import { fromPrice, rateOf, rub, SHIFT_HOURS } from './prices';

const pageSource = (...parts: string[]) =>
  readFileSync(join(__dirname, '..', 'app', ...parts), 'utf8');

describe('city landing pages', () => {
  it('holds the four cities with approximate distances', () => {
    expect(CITIES.map((c) => [c.slug, c.distanceKm])).toEqual([
      ['naberezhnye-chelny', 0],
      ['elabuga', 25],
      ['nizhnekamsk', 40],
      ['mendeleevsk', 30],
    ]);
    expect(NEARBY_CITIES.map((c) => c.name)).toEqual(['Елабуга', 'Нижнекамск', 'Менделеевск']);
  });

  it('resolves every city × landing combination', () => {
    const pages = cityPages();
    expect(pages).toHaveLength(LANDINGS.length * CITIES.length);
    for (const page of pages) {
      expect(landingBySlug(page.slug)).toBeDefined();
      expect(cityBySlug(page.city)).toBeDefined();
      expect(cityPath(page.slug, page.city)).toBe(`/arenda/${page.slug}/${page.city}`);
    }
    expect(cityBySlug('kazan')).toBeUndefined();
  });

  it('gives every page a unique heading, title, description and intro', () => {
    const texts = LANDINGS.flatMap((landing) => CITIES.map((city) => cityPageText(landing, city)));
    for (const key of ['h1', 'title', 'description', 'intro'] as const) {
      expect(new Set(texts.map((t) => t[key])).size).toBe(texts.length);
    }
    for (const landing of LANDINGS) {
      for (const city of CITIES) {
        const text = cityPageText(landing, city);
        expect(text.intro).not.toBe(landing.intro);
        expect(text.h1).toContain(city.inCity);
        // Not the base landing's heading «Аренда … в Набережных Челнах».
        expect(text.h1).not.toBe(`Аренда ${landing.title} в Набережных Челнах`);
        expect(text.intro).toContain('Стоимость подачи назовёт диспетчер');
      }
    }
  });

  it('marks distances as approximate and invents no delivery price', () => {
    for (const landing of LANDINGS) {
      for (const city of NEARBY_CITIES) {
        const { intro, description } = cityPageText(landing, city);
        expect(intro).toContain(`около ${city.distanceKm} км`);
        expect(`${intro} ${description}`).not.toMatch(/подача[^.]*\d+\s?₽/i);
      }
    }
  });

  it('shows prices from lib/prices.ts', () => {
    for (const landing of LANDINGS) {
      const rate = rateOf(landing.machine);
      for (const city of CITIES) {
        const text = cityPageText(landing, city);
        expect(text.title).toContain(fromPrice(rate));
        expect(text.description).toContain(`от ${rub(rate * SHIFT_HOURS)} ₽`);
      }
    }
    expect(shiftExample(4000)).toBe('8\u00a0ч × 4\u00a0000\u00a0₽ = 32\u00a0000\u00a0₽');
    expect(shiftExample(rateOf('truck'))).toBe('8\u00a0ч × 3\u00a0300\u00a0₽ = 26\u00a0400\u00a0₽');
  });

  it('never writes «СП16» on the city pages', () => {
    const texts = LANDINGS.flatMap((landing) =>
      CITIES.map((city) => Object.values(cityPageText(landing, city)).join(' ')),
    );
    texts.push(pageSource('arenda', '[slug]', '[city]', 'page.tsx'));
    texts.push(pageSource('arenda', '[slug]', 'page.tsx'));
    for (const text of texts) expect(text).not.toContain('СП16');
  });
});
