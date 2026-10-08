import { describe, expect, it } from 'vitest';
import {
  customerDemandText,
  demandLevel,
  demandSummary,
  orderCity,
  providerDemandText,
  type DemandOrder,
} from './demand';
import { nearestCity } from './geo';

const now = new Date('2026-10-08T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const tomorrow = new Date(now.getTime() + 86_400_000);

function order(partial: Partial<DemandOrder> & { categoryId: string }): DemandOrder {
  return {
    categoryName: partial.categoryId === 'exc' ? 'Экскаватор-погрузчик' : 'Автокран',
    createdAt: daysAgo(1),
    desiredStartDate: tomorrow,
    ...partial,
  };
}

describe('demandLevel', () => {
  it('compares orders with free machines', () => {
    expect(demandLevel(0, 0)).toBe('low');
    expect(demandLevel(1, 10)).toBe('low');
    expect(demandLevel(4, 10)).toBe('medium');
    expect(demandLevel(10, 10)).toBe('high');
    expect(demandLevel(3, 0)).toBe('high');
  });
});

describe('orderCity and nearestCity', () => {
  it('matches the city by name or by the nearest point', () => {
    expect(orderCity({ city: 'Елабуга' })?.name).toBe('Елабуга');
    expect(orderCity({ city: 'набережные челны' })?.name).toBe('Набережные Челны');
    expect(orderCity({ city: 'Деревня', lat: 55.75, lon: 52.07 })?.name).toBe('Елабуга');
    expect(orderCity({ city: null })).toBeNull();
    expect(nearestCity(55.75, 37.62)).toBeNull(); // Moscow is too far
  });
});

describe('demandSummary', () => {
  const orders: DemandOrder[] = [
    order({ categoryId: 'exc', city: 'Набережные Челны', lat: 55.74, lon: 52.4 }),
    order({ categoryId: 'exc', city: 'Набережные Челны', lat: 55.74, lon: 52.4 }),
    order({ categoryId: 'exc', lat: 55.75, lon: 52.07, desiredStartDate: daysAgo(1) }),
    order({ categoryId: 'crane', city: 'Елабуга' }),
    order({ categoryId: 'exc', createdAt: daysAgo(20) }), // too old
    { ...order({ categoryId: 'exc' }), categoryId: null }, // no category: cities only
  ];
  const supply = [
    { categoryId: 'exc', lat: 55.74, lon: 52.4 },
    { categoryId: 'crane', lat: 55.74, lon: 52.4 },
    { categoryId: 'crane', lat: 55.74, lon: 52.4 },
    { categoryId: 'crane', lat: 55.74, lon: 52.4 },
    { categoryId: 'crane', lat: null, lon: null },
  ];

  it('groups the fortnight by category with the free machines', () => {
    const summary = demandSummary(orders, supply, now);
    expect(summary.categories).toEqual([
      {
        categoryId: 'exc',
        name: 'Экскаватор-погрузчик',
        orders: 3,
        upcoming: 2,
        supply: 1,
        level: 'high',
      },
      { categoryId: 'crane', name: 'Автокран', orders: 1, upcoming: 1, supply: 4, level: 'low' },
    ]);
    expect(summary.since).toBe(daysAgo(14).toISOString());
  });

  it('groups by the fixed cities and finds the top category', () => {
    const { cities } = demandSummary(orders, supply, now);
    // Ties are sorted by name.
    expect(cities.map((row) => [row.city, row.orders, row.supply, row.level])).toEqual([
      ['Елабуга', 2, 4, 'medium'],
      ['Набережные Челны', 2, 4, 'medium'],
    ]);
    const chelny = cities.find((row) => row.city === 'Набережные Челны')!;
    expect(chelny.topCategory).toBe('Экскаватор-погрузчик');
    expect(chelny).toMatchObject({ lat: 55.7436, lon: 52.3959 });
  });

  it('is empty without orders', () => {
    const summary = demandSummary([], supply, now);
    expect(summary.categories).toEqual([]);
    expect(summary.cities).toEqual([]);
    expect(providerDemandText(summary)).toBeNull();
  });
});

describe('texts', () => {
  it('tells the customer whether to book ahead', () => {
    expect(customerDemandText('high', 'Автокран')).toBe(
      'Свободных машин мало (автокран) — укажите дату заранее',
    );
    expect(customerDemandText('medium', 'Автокран')).toContain('лучше указать дату заранее');
    expect(customerDemandText('low', 'Экскаватор')).toBe(
      'Сейчас много свободных машин: экскаватор',
    );
    expect(customerDemandText(null)).toBe('Сейчас много свободных машин: техники');
  });

  it('tells the provider where the busiest category is wanted', () => {
    const text = providerDemandText({
      since: '',
      categories: [
        {
          categoryId: 'exc',
          name: 'Экскаватор-погрузчик',
          orders: 3,
          upcoming: 2,
          supply: 1,
          level: 'high',
        },
      ],
      cities: [
        {
          city: 'Набережные Челны',
          lat: 0,
          lon: 0,
          orders: 2,
          supply: 1,
          level: 'high',
          topCategory: 'Экскаватор-погрузчик',
        },
      ],
    });
    expect(text).toBe(
      'На завтра и позже: экскаватор-погрузчик в городе Набережные Челны — свободных мало — цены выше (3 заявки, свободных машин: 1)',
    );
  });
});
