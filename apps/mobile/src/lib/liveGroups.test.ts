import { describe, expect, it } from 'vitest';
import type { LiveMachine } from './api';
import { groupLive, liveGroupLabel, livePriceText, toBasePins, toLiveMarkers } from './line';
import { nearbyAround, nearbyPoints } from './mapNearby';
import type { CustomerPin, ProviderPin } from './providersMap';

const BASE = { lat: 55.7436, lon: 52.3959 };

const machine = (id: string, over: Partial<LiveMachine> = {}): LiveMachine => ({
  id,
  ...BASE,
  driver: '',
  company: { id: 'house', name: 'СпецПласт16', verified: true, isHouse: true },
  equipment: {
    id: `e-${id}`,
    name: `Машина ${id}`,
    category: 'Экскаваторы',
    categorySlug: 'excavators',
    hourlyRate: 4000,
    dailyRate: 32000,
  },
  note: null,
  distanceKm: null,
  bubble: `Я на линии до отключения · Машина ${id} · от 4 000 ₽/ч`,
  updatedAt: '2026-11-11T09:00:00Z',
  live: false,
  until: 'до отключения',
  busyToday: false,
  ...over,
});

const other = { id: 'c2', name: 'Стройтех', verified: false, isHouse: false };

describe('house fleet always on the line: one marker, not a pile', () => {
  it('machines without GPS at one point are one group; live GPS is always its own pin', () => {
    const groups = groupLive([
      machine('a'),
      machine('b'),
      machine('gps', { live: true }),
      machine('c'),
      machine('x', { company: other }),
      machine('far', { lat: 55.79, lon: 49.11 }),
    ]);
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ['a', 'b', 'c'],
      ['gps'],
      ['x'],
      ['far'],
    ]);
  });

  it('the group marker reads «N машин на линии · СпецПласт16» and lists the machines', () => {
    const markers = toLiveMarkers([
      machine('a'),
      machine('b', { busyToday: true }),
      machine('c', {
        equipment: {
          id: 'e-c',
          name: 'Каток',
          category: null,
          categorySlug: null,
          hourlyRate: 0,
          dailyRate: 0,
        },
      }),
    ]);
    expect(markers).toHaveLength(1);
    const group = markers[0]!;
    expect(group).toMatchObject({
      key: 'live:a',
      ...BASE,
      short: 'СП·3',
      head: 'СпецПласт16',
      body: '2 машины на линии',
      title: '2 машины на линии · СпецПласт16',
      house: true,
      equipmentId: null,
    });
    expect(group.items).toEqual([
      { equipmentId: 'e-a', name: 'Машина a', price: 'от 4\u00a0000\u00a0₽/ч' },
      { equipmentId: 'e-b', name: 'Машина b', price: 'занята сегодня' },
      { equipmentId: 'e-c', name: 'Каток', price: 'цена договорная' },
    ]);
  });

  it('a single machine stays the usual pin with the server’s bubble', () => {
    const [single] = toLiveMarkers([machine('a')]);
    expect(single).toMatchObject({
      key: 'live:a',
      equipmentId: 'e-a',
      head: 'Я на линии до отключения',
      body: 'Машина a · от 4 000 ₽/ч',
      house: true,
    });
    expect(single!.items).toBeUndefined();
  });

  it('words the label and the price', () => {
    expect(liveGroupLabel([machine('a', { busyToday: true })])).toEqual({
      title: '1 машина · заняты сегодня',
      sub: 'СпецПласт16',
    });
    expect(liveGroupLabel([machine('a', { company: other }), machine('b')]).sub).toBe('Я на линии');
    expect(livePriceText(null)).toBe('цена договорная');
  });

  it('an empty «base» list (the server since 2026-11-11) is no pins and no crash', () => {
    expect(toBasePins([])).toEqual([]);
    expect(toLiveMarkers([])).toEqual([]);
  });
});

describe('«кто рядом» after a tap on a pin', () => {
  const pin = (over: Partial<ProviderPin>): ProviderPin => ({
    id: 'c1',
    name: 'Парк',
    lat: 55.75,
    lon: 52.41,
    note: null,
    imageUrl: null,
    equipmentCount: 2,
    isHouse: false,
    catalogUrl: '/providers/c1',
    ...over,
  });
  const customer: CustomerPin = {
    id: 'o1',
    lat: 55.76,
    lon: 52.43,
    title: 'Заказчик рядом',
    sub: 'нужно: Экскаваторы · Анна П.',
    machinery: 'Экскаваторы',
    customer: 'Анна П.',
    orderUrl: '/orders/o1',
    approximate: true,
  };

  it('lists the nearest pins with distance, name and machinery; the tapped one is left out', () => {
    const points = nearbyPoints(
      [
        pin({ id: 'near', name: 'Стройтех', machines: ['Самосвалы'], machinesMore: 2 }),
        pin({ id: 'kazan', name: 'Казань-Техника', lat: 55.79, lon: 49.11 }),
        pin({ id: 'moscow', name: 'Далеко', lat: 55.75, lon: 37.62 }),
      ],
      [customer],
      toLiveMarkers([machine('a'), machine('b')]),
    );
    const items = nearbyAround('provider:near', points);
    expect(items.map((item) => item.key)).toEqual(['live:a', 'customer:o1', 'provider:kazan']);
    expect(items[0]).toMatchObject({ title: '2 машины на линии · СпецПласт16' });
    expect(items[0]!.distance).toBe('1,1\u00a0км');
    expect(items[1]).toMatchObject({ title: 'Заказчик рядом', sub: 'нужно: Экскаваторы' });
    expect(items[2]!.distance).toMatch(/^\d+\u00a0км$/);
    // Moscow is farther than «рядом» reaches.
    expect(items.some((item) => item.key === 'provider:moscow')).toBe(false);
    // The tapped provider’s own line.
    expect(points.find((point) => point.key === 'provider:near')).toMatchObject({
      title: 'Стройтех',
      sub: 'Самосвалы, ещё 2',
    });
  });

  it('the house pin hidden under its «N машин на линии» marker is not listed twice', () => {
    const points = nearbyPoints(
      [pin({ id: 'house', isHouse: true, ...BASE })],
      [],
      toLiveMarkers([machine('a'), machine('b')]),
    );
    expect(points.map((point) => point.key)).toEqual(['live:a']);
    // Without the group the company’s own pin is the one on the map.
    expect(
      nearbyPoints([pin({ id: 'house', isHouse: true, ...BASE })], [], []).map((p) => p.title),
    ).toEqual(['СпецПласт16']);
  });

  it('an unknown key or a lonely pin gives an empty list', () => {
    expect(nearbyAround('provider:none', [])).toEqual([]);
    expect(nearbyAround('customer:o1', nearbyPoints([], [customer], []))).toEqual([]);
  });
});
