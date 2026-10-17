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
    const ids = matchIncoming(company, rows, orders, 'Казань').map((order) => order.id);
    expect([...ids].sort()).toEqual(['any', 'city-only', 'family']);
  });

  it('lists the nearest orders first, unplaced ones after', () => {
    const chelny = { latitude: 55.74, longitude: 52.4, city: 'Набережные Челны' };
    const wide = { ...company, radiusKm: 400, isHouse: true };
    const ids = matchIncoming(
      wide,
      rows,
      [
        { id: 'far', categoryId: 'exc', location: chelny },
        { id: 'unknown', categoryId: 'exc', location: { city: 'Бавлы' } },
        { id: 'near', categoryId: 'exc', location: kazan },
      ],
      'Казань',
    ).map((order) => order.id);
    expect(ids).toEqual(['near', 'far', 'unknown']);
  });

  it('places an order with no location at the home city', () => {
    const noLocation = [{ id: 'home', categoryId: 'exc', location: null }];
    expect(matchIncoming(company, rows, noLocation, 'Казань')).toHaveLength(1);
    expect(matchIncoming(company, rows, noLocation, 'Москва')).toHaveLength(0);
  });

  it('shows a location-less order to a provider whose address names the home city', () => {
    // No base coordinates yet, only an address: the alert treats such an
    // order as a home-city one, so the feed must agree.
    const noLocation = [{ id: 'home', categoryId: 'exc', location: null }];
    const addressOnly = {
      categoryIds: ['exc'],
      baseLat: null,
      baseLon: null,
      baseAddress: 'Казань, ул. Баумана 1',
      radiusKm: 100,
    };
    expect(matchIncoming(addressOnly, rows, noLocation, 'Казань')).toHaveLength(1);
    expect(matchIncoming(addressOnly, rows, noLocation, 'Москва')).toHaveLength(0);
  });

  it('sorts orders with no address after those with a point or a city', () => {
    // A base right in the city centre: an order with no location would be 0 km.
    const centre = { ...company, baseLat: 55.7961, baseLon: 49.1064 };
    const ids = matchIncoming(
      centre,
      rows,
      [
        { id: 'old-no-address', categoryId: 'exc', location: null },
        { id: 'newer-no-address', categoryId: 'exc', location: null },
        { id: 'far-point', categoryId: 'exc', location: { latitude: 55.9, longitude: 49.5 } },
        { id: 'city-only', categoryId: 'exc', location: { city: 'Казань' } },
        { id: 'near-point', categoryId: 'exc', location: kazan },
      ],
      'Казань',
    ).map((order) => order.id);
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
