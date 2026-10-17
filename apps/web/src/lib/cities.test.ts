import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addressNamesCity,
  BASE_CITY_SLUG,
  CITIES,
  cityBySlug,
  cityOffer,
  cityPages,
  cityPageText,
  cityPath,
  houseArea,
  HOUSE_CITIES,
  joiningText,
  kmBetween,
  NEARBY_CITIES,
  nearestCities,
  rowServesCity,
  shiftExample,
  type City,
  type CityFleetRow,
} from './cities';
import { HOUSE_COMPANY_ID } from './fleet';
import { landingBySlug, LANDINGS } from './landings';
import { fromPrice, rateOf, rub, SHIFT_HOURS } from './prices';

const pageSource = (...parts: string[]) =>
  readFileSync(join(__dirname, '..', 'app', ...parts), 'utf8');

const city = (slug: string): City => cityBySlug(slug)!;
const backhoe = landingBySlug('ekskavator-pogruzchik')!;

/** A third-party machine based at `point` with a delivery radius. */
function machine(
  id: string,
  point: { lat: number; lon: number } | null,
  radiusKm = 100,
  hourlyRate = 3500,
  locationCity: string | null = null,
): CityFleetRow {
  return {
    id,
    name: `Экскаватор-погрузчик ${id}`,
    companyId: `company-${id}`,
    hourlyRate,
    dailyRate: null,
    company: {
      name: `Компания ${id}`,
      baseLat: point?.lat ?? null,
      baseLon: point?.lon ?? null,
      deliveryRadiusKm: radiusKm,
    },
    location: { city: locationCity, latitude: null, longitude: null },
  };
}

describe('the city list', () => {
  it('covers Russia: СпецПласт16’s area first, then 80+ large cities', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(80);
    expect(CITIES.slice(0, 4).map((c) => [c.slug, c.houseKm])).toEqual([
      ['naberezhnye-chelny', 0],
      ['elabuga', 25],
      ['nizhnekamsk', 40],
      ['mendeleevsk', 30],
    ]);
    expect(HOUSE_CITIES.map((c) => c.slug)).toEqual([
      'naberezhnye-chelny',
      'elabuga',
      'nizhnekamsk',
      'mendeleevsk',
    ]);
    expect(NEARBY_CITIES.map((c) => c.name)).toEqual(['Елабуга', 'Нижнекамск', 'Менделеевск']);
    for (const name of ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Казань', 'Владивосток']) {
      expect(CITIES.some((c) => c.name === name)).toBe(true);
    }
  });

  it('has unique latin slugs and names', () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length);
    for (const c of CITIES) expect(c.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('has the case forms, the region and a point in Russia for every city', () => {
    for (const c of CITIES) {
      expect(c.inCity).toMatch(/^во? [А-ЯЁ]/);
      expect(c.around).toMatch(/^по [А-ЯЁ]/);
      // The form differs from the name, except for indeclinable names.
      if (!['Сочи', 'Тольятти', 'Улан-Удэ'].includes(c.name)) {
        expect(c.inCity.slice(c.inCity.indexOf(' ') + 1)).not.toBe(c.name);
      }
      expect(c.region.length).toBeGreaterThan(3);
      expect(c.lat).toBeGreaterThan(41);
      expect(c.lat).toBeLessThan(70);
      expect(c.lon).toBeGreaterThan(19);
      expect(c.lon).toBeLessThan(180);
    }
    expect(city('kazan').inCity).toBe('в Казани');
    expect(city('novosibirsk').inCity).toBe('в Новосибирске');
    expect(city('vladivostok').inCity).toBe('во Владивостоке');
    expect(city('nizhnij-novgorod').around).toBe('по Нижнему Новгороду');
  });

  it('builds a path for every city × landing combination', () => {
    const pages = cityPages();
    expect(pages).toHaveLength(LANDINGS.length * CITIES.length);
    for (const page of pages) {
      expect(landingBySlug(page.slug)).toBeDefined();
      expect(cityBySlug(page.city)).toBeDefined();
      expect(cityPath(page.slug, page.city)).toBe(`/arenda/${page.slug}/${page.city}`);
    }
    expect(cityBySlug('atlantida')).toBeUndefined();
  });

  it('links each city to its neighbours', () => {
    expect(nearestCities(city('moskva')).map((c) => c.slug)).toEqual(
      expect.arrayContaining(['himki', 'mytishchi', 'balashiha']),
    );
    expect(nearestCities(city('kazan'), 20)).not.toContainEqual(city('kazan'));
    expect(Math.round(kmBetween(city('moskva'), city('sankt-peterburg')))).toBeGreaterThan(600);
  });
});

describe('the honest city page model', () => {
  it('is empty where nobody serves the city: no machines, no prices', () => {
    for (const slug of ['novosibirsk', 'moskva', 'vladivostok', 'kazan']) {
      expect(cityOffer(backhoe, city(slug), [])).toEqual({ kind: 'empty' });
    }
    const text = cityPageText(backhoe, city('novosibirsk'), { kind: 'empty' });
    // The page shows joiningText as its highlighted line; the description carries it too.
    expect(text.description).toContain(
      'исполнители в Новосибирске подключаются — оставьте заявку, мы найдём технику.',
    );
    expect(text.intro).toContain('Новосибирск (Новосибирская область)');
    expect(text.intro).not.toContain('подключаются');
    expect(joiningText(city('kazan'))).toBe(
      'Исполнители в Казани подключаются — оставьте заявку, мы найдём технику.',
    );
    for (const value of Object.values(text)) {
      expect(value).not.toMatch(/₽|\d\s?000|JCB|CASE|Hidromek|отзыв/);
      expect(value).not.toMatch(/СпецПласт16 (выезжает|работает)/);
    }
    expect(text.title).toBe('Аренда экскаватора-погрузчика в Новосибирске — заявка исполнителям');
  });

  it('shows СпецПласт16’s list price only where its own fleet goes', () => {
    const chelny = cityOffer(backhoe, city(BASE_CITY_SLUG), []);
    expect(chelny).toMatchObject({
      kind: 'available',
      houseServes: true,
      fromRate: rateOf('backhoe'),
    });
    // Kazan is ~200 km from the base, beyond the default 100 km radius.
    expect(cityOffer(backhoe, city('kazan'), []).kind).toBe('empty');
    // The owner widens the radius on the map: Kazan is covered.
    const wide = houseArea({ baseLat: null, baseLon: null, deliveryRadiusKm: 250 });
    expect(cityOffer(backhoe, city('kazan'), [], wide)).toMatchObject({ houseServes: true });
  });

  it('lists a provider only within its own radius of the city', () => {
    const novosibirsk = city('novosibirsk');
    const near = machine('near', { lat: 55.1, lon: 83.1 }, 50, 3000);
    const far = machine('far', { lat: 55.75, lon: 37.62 }, 100, 2000);
    const offer = cityOffer(backhoe, novosibirsk, [near, far]);
    expect(offer).toEqual({
      kind: 'available',
      fromRate: 3000,
      houseServes: false,
      machines: [{ id: 'near', name: near.name, isHouse: false, hourlyRate: 3000 }],
    });
    const text = cityPageText(backhoe, novosibirsk, offer);
    expect(text.title).toBe(
      `Аренда экскаватора-погрузчика в Новосибирске — ${'от 3 000 ₽/ч с машинистом'}`,
    );
    expect(text.intro).not.toContain('СпецПласт16');
    // Too small a radius: not listed.
    expect(rowServesCity(machine('x', { lat: 55.1, lon: 83.1 }, 5), novosibirsk, houseArea())).toBe(
      false,
    );
    // No point at all: only in the city its location names.
    expect(
      rowServesCity(machine('y', null, 100, 3000, 'Новосибирск'), novosibirsk, houseArea()),
    ).toBe(true);
    expect(rowServesCity(machine('z', null, 100, 3000, 'Омск'), novosibirsk, houseArea())).toBe(
      false,
    );
  });

  it('counts СпецПласт16’s machines by its area, first in the list', () => {
    const house: CityFleetRow = {
      ...machine('house', null, 100, 4500),
      companyId: HOUSE_COMPANY_ID,
    };
    const other = machine('other', { lat: 55.7, lon: 52.3 }, 50, 3000);
    const offer = cityOffer(backhoe, city('elabuga'), [other, house]);
    expect(offer.kind === 'available' && offer.machines.map((m) => m.id)).toEqual([
      'house',
      'other',
    ]);
    expect(offer.kind === 'available' && offer.fromRate).toBe(3000);
    expect(cityOffer(backhoe, city('moskva'), [house])).toEqual({ kind: 'empty' });
  });

  it('shows no СпецПласт16 price where its loaded fleet has no such machine', () => {
    const other = machine('other', { lat: 55.7, lon: 52.3 }, 50, 3000);
    // The database answered and СпецПласт16 has no machine of this category.
    expect(cityOffer(backhoe, city('elabuga'), [], houseArea(), true)).toEqual({ kind: 'empty' });
    expect(cityOffer(backhoe, city('elabuga'), [other], houseArea(), true)).toMatchObject({
      houseServes: false,
      fromRate: 3000,
    });
    const house: CityFleetRow = { ...machine('house', null), companyId: HOUSE_COMPANY_ID };
    expect(cityOffer(backhoe, city('elabuga'), [house], houseArea(), true)).toMatchObject({
      houseServes: true,
      fromRate: rateOf('backhoe'),
    });
  });

  it('puts unpriced machines after the priced ones', () => {
    const point = { lat: 55.1, lon: 83.1 };
    const offer = cityOffer(backhoe, city('novosibirsk'), [
      { ...machine('free', point), hourlyRate: null },
      machine('priced', point, 100, 5000),
      machine('cheap', point, 100, 2500),
    ]);
    expect(offer.kind === 'available' && offer.machines.map((m) => m.id)).toEqual([
      'cheap',
      'priced',
      'free',
    ]);
    expect(offer.kind === 'available' && offer.fromRate).toBe(2500);
  });

  it('places a company without a map point by its base address', () => {
    const row = machine('addr', null);
    row.company!.baseAddress = 'г. Нижний Новгород, ул. Белинского, 1';
    expect(rowServesCity(row, city('nizhnij-novgorod'), houseArea())).toBe(true);
    expect(rowServesCity(row, city('novosibirsk'), houseArea())).toBe(false);
    expect(addressNamesCity('Ростов-на-Дону, пр. Ленина', city('rostov-na-donu'))).toBe(true);
    expect(addressNamesCity('в Казани, Баумана 1', city('kazan'))).toBe(true);
    expect(addressNamesCity('Омск', city('tomsk'))).toBe(false);
  });
});

describe('city page texts', () => {
  const offerOf = (c: City, landing = backhoe) => cityOffer(landing, c, []);

  it('gives every page a unique heading, title, description and intro', () => {
    const texts = LANDINGS.flatMap((landing) =>
      CITIES.map((c) => cityPageText(landing, c, offerOf(c, landing))),
    );
    for (const key of ['h1', 'title', 'description', 'intro'] as const) {
      expect(new Set(texts.map((t) => t[key])).size).toBe(texts.length);
    }
    for (const landing of LANDINGS) {
      for (const c of CITIES) {
        const text = cityPageText(landing, c, offerOf(c, landing));
        expect(text.intro).not.toBe(landing.intro);
        expect(text.h1).toContain(c.inCity);
        expect(text.title).toContain(c.inCity);
      }
    }
  });

  it('marks distances as approximate and invents no delivery price', () => {
    for (const landing of LANDINGS) {
      for (const c of NEARBY_CITIES) {
        const { intro, description } = cityPageText(landing, c, offerOf(c, landing));
        expect(intro).toContain(`около ${c.houseKm} км`);
        expect(intro).toContain('Стоимость подачи назовёт диспетчер');
        expect(`${intro} ${description}`).not.toMatch(/подача[^.]*\d+\s?₽/i);
      }
    }
  });

  it('shows prices from lib/prices.ts in СпецПласт16’s area', () => {
    for (const landing of LANDINGS) {
      const rate = rateOf(landing.machine);
      for (const c of HOUSE_CITIES) {
        const text = cityPageText(landing, c, offerOf(c, landing));
        expect(text.title).toContain(fromPrice(rate));
        expect(text.description).toContain(`от ${rub(rate * SHIFT_HOURS)} ₽`);
      }
    }
    expect(shiftExample(4000)).toBe('8 ч × 4 000 ₽ = 32 000 ₽');
    expect(shiftExample(rateOf('truck'))).toBe('8 ч × 3 300 ₽ = 26 400 ₽');
  });

  it('never writes «СП16» on the city pages', () => {
    const texts = LANDINGS.flatMap((landing) =>
      CITIES.map((c) => Object.values(cityPageText(landing, c, offerOf(c, landing))).join(' ')),
    );
    texts.push(pageSource('arenda', '[slug]', '[city]', 'page.tsx'));
    texts.push(pageSource('arenda', '[slug]', 'page.tsx'));
    for (const text of texts) expect(text).not.toContain('СП16');
  });

  it('points every city page’s canonical at itself', () => {
    const source = pageSource('arenda', '[slug]', '[city]', 'page.tsx');
    expect(source).toContain('alternates: { canonical: path }');
    expect(source).not.toContain('naberezhnye-chelny');
  });
});
