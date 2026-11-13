import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_CITY_SLUG,
  cityBySlug,
  cityOffer,
  cityPageIndexable,
  NEARBY_CITIES,
  type City,
  type CityFleetRow,
} from './cities';
import { HOUSE_COMPANY_ID } from './fleet';
import { landingBySlug } from './landings';

const city = (slug: string): City => cityBySlug(slug)!;
const backhoe = landingBySlug('ekskavator-pogruzchik')!;

function row(id: string, point: { lat: number; lon: number }, companyId = `company-${id}`) {
  return {
    id,
    name: `Экскаватор-погрузчик ${id}`,
    companyId,
    hourlyRate: 3500,
    dailyRate: null,
    company: {
      name: `Компания ${id}`,
      baseLat: point.lat,
      baseLon: point.lon,
      deliveryRadiusKm: 100,
    },
    location: { city: null, latitude: null, longitude: null },
  } satisfies CityFleetRow;
}

describe('cityPageIndexable', () => {
  const base = city(BASE_CITY_SLUG);
  const house = row('house', { lat: base.lat, lon: base.lon }, HOUSE_COMPANY_ID);

  it('indexes the base city with СпецПласт16’s own fleet', () => {
    expect(cityPageIndexable(base, cityOffer(backhoe, base, [house], undefined, true))).toBe(true);
    // Without the database the house list price stands for its area.
    expect(cityPageIndexable(base, cityOffer(backhoe, base, []))).toBe(true);
  });

  it('keeps a nearby town with only the house fleet out of the index', () => {
    for (const town of NEARBY_CITIES) {
      const offer = cityOffer(backhoe, town, [house], undefined, true);
      expect(offer.kind, town.slug).toBe('available');
      expect(cityPageIndexable(town, offer), town.slug).toBe(false);
    }
  });

  it('indexes any city a provider’s machine serves', () => {
    const elabuga = city('elabuga');
    const local = row('local', { lat: elabuga.lat, lon: elabuga.lon });
    expect(
      cityPageIndexable(elabuga, cityOffer(backhoe, elabuga, [house, local], undefined, true)),
    ).toBe(true);
    const novosibirsk = city('novosibirsk');
    const there = row('nsk', { lat: novosibirsk.lat, lon: novosibirsk.lon });
    expect(cityPageIndexable(novosibirsk, cityOffer(backhoe, novosibirsk, [there]))).toBe(true);
  });

  it('keeps an empty city out of the index', () => {
    const omsk = city('omsk');
    expect(cityPageIndexable(omsk, cityOffer(backhoe, omsk, []))).toBe(false);
  });

  it('is the one rule of the page and the sitemap', () => {
    const page = readFileSync(
      join(__dirname, '..', 'app', 'arenda', '[slug]', '[city]', 'page.tsx'),
      'utf8',
    );
    const sitemap = readFileSync(join(__dirname, '..', 'app', 'sitemap.ts'), 'utf8');
    expect(page).toContain('cityPageIndexable(');
    expect(sitemap).toContain('cityPageIndexable(');
  });
});
