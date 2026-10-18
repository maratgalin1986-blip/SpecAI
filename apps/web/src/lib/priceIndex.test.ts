import { describe, expect, it } from 'vitest';
import {
  buildPriceIndex,
  cellText,
  indexCategories,
  INDEX_MIN_REPORTERS,
  lookupPrice,
  lookupText,
  median,
  placesWithData,
  priceCell,
  type PricePoint,
} from './priceIndex';
import { homeCity, hourlyOf } from './priceIndexData';

const point = (reporter: string, hourly: number, extra: Partial<PricePoint> = {}): PricePoint => ({
  categorySlug: 'excavators',
  reporter,
  hourly,
  city: 'Казань',
  region: 'Республика Татарстан',
  ...extra,
});

describe('median and range', () => {
  it('the middle value, or the mean of the two middle ones', () => {
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('a company counts once: its machines first become their median', () => {
    const cell = priceCell([
      point('c:a', 3000),
      point('c:a', 3000),
      point('c:a', 3000),
      point('c:a', 9000),
      point('c:b', 4000),
      point('c:c', 5000),
    ]);
    // a → 3000, b → 4000, c → 5000; with only 3 no range (it would give all three away).
    expect(cell).toEqual({ median: 4000, min: null, max: null, reporters: 3 });
  });

  it('rounds to 10 ₽ and prints the range from 5 reporters on', () => {
    const three = priceCell([point('c:a', 3333), point('c:b', 3501), point('c:c', 4004)])!;
    expect(three).toMatchObject({ median: 3500, min: null, max: null });
    expect(cellText(three)).toBe('3\u00a0500\u00a0₽/ч');
    const cell = priceCell([
      point('c:a', 3333),
      point('c:b', 3501),
      point('c:c', 4004),
      point('c:d', 3600),
      point('c:e', 3400),
    ])!;
    expect(cell).toMatchObject({ median: 3500, min: 3330, max: 4000, reporters: 5 });
    expect(cellText(cell)).toBe('3\u00a0500\u00a0₽/ч (3\u00a0330\u00a0₽–4\u00a0000\u00a0₽)');
  });
});

describe('k-anonymity', () => {
  it(`no number with fewer than ${INDEX_MIN_REPORTERS} different companies or participants`, () => {
    expect(INDEX_MIN_REPORTERS).toBe(3);
    // Ten machines of two companies are still two companies.
    const two = [
      ...Array.from({ length: 5 }, () => point('c:a', 3000)),
      ...Array.from({ length: 5 }, () => point('c:b', 4000)),
    ];
    expect(priceCell(two)).toBeNull();
    expect(priceCell([...two, point('r:x', 3500)])).not.toBeNull();
  });

  it('keeps only places with enough reporters, falls back to the region and Russia', () => {
    const points = [
      point('c:a', 3000),
      point('c:b', 3500),
      point('c:c', 4000),
      point('c:d', 2500, { city: 'Набережные Челны' }),
      point('c:e', 2700, { city: 'Альметьевск' }),
      point('c:f', 6000, { city: 'Москва', region: 'Москва' }),
    ];
    const index = buildPriceIndex(points);
    expect([...index.cities.keys()]).toEqual(['excavators|казань']);
    expect(index.regions.get('excavators|республика татарстан')?.reporters).toBe(5);
    expect(index.russia.get('excavators')?.reporters).toBe(6);

    expect(lookupPrice(points, 'excavators', { city: 'Казань' })?.scope).toBe('city');
    expect(
      lookupPrice(points, 'excavators', {
        city: 'Набережные Челны',
        region: 'Республика Татарстан',
      }),
    ).toMatchObject({ scope: 'region', place: 'Республика Татарстан' });
    expect(lookupPrice(points, 'excavators', { city: 'Москва', region: 'Москва' })?.scope).toBe(
      'russia',
    );
    expect(lookupPrice(points, 'cranes', { city: 'Казань' })).toBeNull();
  });

  it('what a participant is shown back leaves out his own answer and his company', () => {
    const points = [point('r:me', 1000), point('c:a', 3000), point('c:b', 4000)];
    expect(lookupPrice(points, 'excavators', { city: 'Казань' })).not.toBeNull();
    // Without him only two others are left: nothing to show.
    expect(lookupPrice(points, 'excavators', { city: 'Казань' }, ['r:me'])).toBeNull();
    const more = [...points, point('c:c', 5000), point('c:mine', 2000)];
    const shown = lookupPrice(more, 'excavators', { city: 'Казань' }, ['r:me', 'c:mine']);
    expect(shown?.cell).toEqual({ median: 4000, min: null, max: null, reporters: 3 });
  });

  it('the answer text has only the aggregate', () => {
    const shown = lookupPrice(
      [point('c:a', 3000), point('c:b', 4000), point('c:c', 5000)],
      'excavators',
      { city: 'Казань' },
    );
    const text = lookupText(shown, 'Экскаваторы');
    expect(text).toContain('медиана 4\u00a0000\u00a0₽/ч');
    expect(text).toContain('по данным 3 исполнителей');
    expect(text).not.toMatch(/c:|r:/);
    expect(lookupText(null, 'Экскаваторы')).toContain('вы среди первых');
  });
});

describe('the page lists', () => {
  it('popular categories always, others only with a number; places with data', () => {
    const points = [point('c:a', 3000), point('c:b', 3500), point('c:c', 4000)].map((p) => ({
      ...p,
      categorySlug: 'graders',
    }));
    const index = buildPriceIndex(points);
    const slugs = indexCategories(index).map((category) => category.slug);
    expect(slugs).toContain('graders');
    expect(slugs).toContain('excavators');
    expect(placesWithData(index.cities, points, 'city')).toEqual([
      { place: 'Казань', cells: [{ slug: 'graders', cell: index.cities.get('graders|казань')! }] },
    ]);
  });
});

describe('where a provider’s machine counts', () => {
  it('the nearest city to the base, else the city its address names', () => {
    expect(homeCity({ company: { baseLat: 55.8, baseLon: 49.1, baseAddress: null } })?.name).toBe(
      'Казань',
    );
    expect(
      homeCity({ company: { baseLat: null, baseLon: null, baseAddress: 'Самара, ул. Мира 1' } })
        ?.name,
    ).toBe('Самара');
    expect(homeCity({ location: { city: 'Уфа' } })?.region).toBe('Республика Башкортостан');
    // In the middle of nowhere: Russia only.
    expect(homeCity({ company: { baseLat: 65, baseLon: 100, baseAddress: null } })).toBeNull();
  });

  it('the hourly price as customers see it: the hour, else the shift over 8 hours', () => {
    expect(hourlyOf({ hourlyRate: '3500.00', dailyRate: '30000.00' })).toBe(3500);
    expect(hourlyOf({ hourlyRate: null, dailyRate: 24000 })).toBe(3000);
    expect(hourlyOf({ hourlyRate: null, dailyRate: null })).toBeNull();
  });
});
