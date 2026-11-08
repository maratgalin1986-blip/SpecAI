import { describe, expect, it } from 'vitest';
import {
  distanceText,
  nearbyAround,
  nearbyKey,
  nearbySummary,
  typeCountText,
  type NearbyPoint,
} from './mapNearby';

const chelny = { lat: 55.7436, lon: 52.3959 };

const points: NearbyPoint[] = [
  {
    kind: 'provider',
    id: 'p1',
    lat: 55.7436,
    lon: 52.3959,
    title: 'СпецПласт16',
    sub: 'Набережные Челны',
    href: '/providers/specplast16-house',
    types: ['Экскаваторы', 'Самосвалы'],
  },
  {
    kind: 'provider',
    id: 'p2',
    lat: 55.75,
    lon: 52.41,
    title: 'Стройтех',
    sub: 'Набережные Челны',
    href: '/providers/p2',
    types: ['Гусеничные экскаваторы'],
  },
  {
    kind: 'live',
    id: 'l1',
    lat: 55.76,
    lon: 52.42,
    title: 'Самосвал КамАЗ',
    sub: 'Я на линии',
    href: '/equipment/e1',
    types: ['Самосвалы'],
  },
  {
    kind: 'customer',
    id: 'o1',
    lat: 55.79,
    lon: 52.45,
    title: 'Заказчик рядом',
    sub: 'нужно: Экскаваторы · Анна П.',
    href: '/orders/o1',
    types: [],
  },
  {
    kind: 'provider',
    id: 'p3',
    lat: 59.93,
    lon: 30.33,
    title: 'Питер-Кран',
    sub: 'Санкт-Петербург',
    href: '/providers/p3',
    types: ['Автокраны'],
  },
];

describe('nearbyAround', () => {
  it('lists the neighbours nearest first, without the tapped pin itself and without the far ones', () => {
    const items = nearbyAround(chelny, points, { exclude: nearbyKey(points[0]!) });
    expect(items.map((item) => item.id)).toEqual(['p2', 'l1', 'o1']);
    expect(items[0]?.distanceKm).toBeLessThan(items[1]!.distanceKm);
    expect(items.every((item) => item.distanceKm <= 300)).toBe(true);
  });

  it('respects the limit', () => {
    expect(nearbyAround(chelny, points, { limit: 1 })).toHaveLength(1);
  });

  it('a provider and an order with the same id are two pins', () => {
    const twins: NearbyPoint[] = [
      { ...points[1]!, id: 'same' },
      { ...points[3]!, id: 'same' },
    ];
    expect(nearbyAround(chelny, twins, { exclude: 'provider:same' })).toHaveLength(1);
  });
});

describe('nearbySummary', () => {
  it('«рядом: 2 самосвала, 2 экскаватора, 1 заказчик»', () => {
    const items = nearbyAround(chelny, points);
    expect(nearbySummary(items)).toBe('рядом: 2 самосвала, 2 экскаватора, 1 заказчик');
  });

  it('counts a type without known forms as «N × Тип», and says when nobody is near', () => {
    expect(typeCountText('Автокраны', 3)).toBe('3 автокрана');
    expect(typeCountText('Телескопические погрузчики', 2)).toBe('2 погрузчика');
    expect(typeCountText('Дорожная фреза', 2)).toBe('2 × Дорожная фреза');
    expect(nearbySummary([])).toBe('рядом пока никого');
  });

  it('a provider without types counts as a provider', () => {
    const items = nearbyAround(chelny, [{ ...points[1]!, types: [] }]);
    expect(nearbySummary(items)).toBe('рядом: 1 исполнитель');
  });
});

describe('distanceText', () => {
  it('reads as people say it', () => {
    expect(distanceText(0.1)).toBe('рядом');
    expect(distanceText(1.26)).toBe('1,3\u00a0км');
    expect(distanceText(48.4)).toBe('48\u00a0км');
  });
});
