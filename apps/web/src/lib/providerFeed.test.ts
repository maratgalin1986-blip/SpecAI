import { describe, expect, it } from 'vitest';
import { incomingOrdersWhere, matchIncoming, todayStartMsk } from './providerFeed';

describe('incomingOrdersWhere', () => {
  it('keeps orders of customers without a company (null-safe)', () => {
    const where = incomingOrdersWhere('c1', new Date('2026-10-13T10:00:00Z'));
    expect(where.customer).toEqual({
      OR: [{ companyId: null }, { companyId: { not: 'c1' } }],
    });
    expect(where).not.toHaveProperty('NOT');
    expect(where.bids).toEqual({ none: { equipment: { companyId: 'c1' } } });
    expect(where.status).toBe('OPEN');
  });

  it('drops orders that ended before today (Moscow)', () => {
    const where = incomingOrdersWhere('c1', new Date('2026-10-13T22:30:00Z'));
    // 22:30 UTC is already 14 October in Moscow.
    expect(where.desiredEndDate.gte.toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(todayStartMsk(new Date('2026-10-13T10:00:00Z')).toISOString()).toBe(
      '2026-10-12T21:00:00.000Z',
    );
  });
});

describe('matchIncoming', () => {
  // A group row, its leaves, and the excavator family of routing.ts.
  const rows = [
    { id: 'earth', slug: 'earthworks', parentId: null },
    { id: 'exc', slug: 'excavators', parentId: 'earth' },
    { id: 'wheel', slug: 'wheeled-excavators', parentId: 'earth' },
    { id: 'crane', slug: 'cranes', parentId: null },
  ];
  const kazan = { latitude: 55.79, longitude: 49.12, city: 'Казань' };
  const orders = [
    { id: 'family', categoryId: 'wheel', location: kazan },
    { id: 'any', categoryId: null, location: kazan },
    { id: 'other', categoryId: 'crane', location: kazan },
    // Moscow, ~720 km from Kazan.
    { id: 'far', categoryId: 'exc', location: { latitude: 55.75, longitude: 37.62 } },
    // Only the city is known: its centre is the place.
    { id: 'city-only', categoryId: 'exc', location: { city: 'Казань' } },
    // No place we can locate: only a provider whose base names the city.
    { id: 'unknown', categoryId: 'exc', location: { city: 'Бавлы' } },
  ];
  const company = { categoryIds: ['exc'], baseLat: 55.8, baseLon: 49.1, radiusKm: 100 };

  it('matches like the new-order alert: category family and the radius', () => {
    const ids = matchIncoming(company, rows, orders).map((order) => order.id);
    expect([...ids].sort()).toEqual(['any', 'city-only', 'family']);
  });

  it('lists the nearest orders first, unplaced ones after', () => {
    const chelny = { latitude: 55.74, longitude: 52.4, city: 'Набережные Челны' };
    const wide = { ...company, radiusKm: 400, isHouse: true };
    const ids = matchIncoming(wide, rows, [
      { id: 'far', categoryId: 'exc', location: chelny },
      { id: 'unknown', categoryId: 'exc', location: { city: 'Бавлы' } },
      { id: 'near', categoryId: 'exc', location: kazan },
    ]).map((order) => order.id);
    expect(ids).toEqual(['near', 'far', 'unknown']);
  });

  it('never places an order with no location in a default town', () => {
    const noLocation = [{ id: 'nowhere', categoryId: 'exc', location: null }];
    // A provider right in Набережные Челны or in Казань: no distance to an
    // unknown place, so not offered.
    expect(matchIncoming(company, rows, noLocation)).toHaveLength(0);
    const chelny = { ...company, baseLat: 55.74, baseLon: 52.4 };
    expect(matchIncoming(chelny, rows, noLocation)).toHaveLength(0);
    // The house fleet sorts out orders nobody can place.
    expect(matchIncoming({ ...company, isHouse: true }, rows, noLocation)).toHaveLength(1);
  });

  it('shows a location-less order to no provider by its address alone', () => {
    const noLocation = [{ id: 'nowhere', categoryId: 'exc', location: null }];
    for (const baseAddress of ['Казань, ул. Баумана 1', 'Набережные Челны, Промзона']) {
      const addressOnly = { categoryIds: ['exc'], baseLat: null, baseLon: null, baseAddress };
      expect(matchIncoming(addressOnly, rows, noLocation)).toHaveLength(0);
    }
  });

  it('places a city named anywhere in Russia at its centre', () => {
    const samara = { ...company, baseLat: 53.2, baseLon: 50.15 };
    const ids = matchIncoming(samara, rows, [
      { id: 'samara', categoryId: 'exc', location: { city: 'Самара' } },
      { id: 'tolyatti', categoryId: 'exc', location: { addressLine: 'в Тольятти, промзона' } },
      { id: 'kazan', categoryId: 'exc', location: { city: 'Казань' } },
    ]).map((order) => order.id);
    expect(ids).toEqual(['samara', 'tolyatti']);
  });

  it('sorts orders with no address after those with a point or a city', () => {
    const house = { ...company, baseLat: 55.7961, baseLon: 49.1064, isHouse: true };
    const ids = matchIncoming(house, rows, [
      { id: 'old-no-address', categoryId: 'exc', location: null },
      { id: 'newer-no-address', categoryId: 'exc', location: null },
      { id: 'far-point', categoryId: 'exc', location: { latitude: 55.9, longitude: 49.5 } },
      { id: 'city-only', categoryId: 'exc', location: { city: 'Казань' } },
      { id: 'near-point', categoryId: 'exc', location: kazan },
    ]).map((order) => order.id);
    // The city centre itself, the point 1 km away, the point 30 km away, then
    // the orders with no address in their own (newest first) order.
    expect(ids).toEqual([
      'city-only',
      'near-point',
      'far-point',
      'old-no-address',
      'newer-no-address',
    ]);
  });

  it('keeps an unknown place for a base in that city and for the house fleet', () => {
    const bavly = { ...company, baseAddress: 'г. Бавлы, промзона' };
    expect(matchIncoming(bavly, rows, orders).map((order) => order.id)).toContain('unknown');
    const house = { ...company, isHouse: true };
    expect(matchIncoming(house, rows, orders).map((order) => order.id)).toContain('unknown');
    expect(matchIncoming(company, rows, orders).map((order) => order.id)).not.toContain('unknown');
  });

  it('offers nothing to a company without machinery, as the app does', () => {
    expect(matchIncoming({ categoryIds: [] }, rows, orders)).toEqual([]);
  });
});
