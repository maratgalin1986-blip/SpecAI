import { describe, expect, it } from 'vitest';
import { incomingOrdersWhere, matchIncoming, todayStartMsk, widenToGroups } from './providerFeed';

const groups = [
  { id: 'earth', label: 'Земляные работы', categoryIds: ['backhoe', 'excavator'] },
  { id: 'lift', label: 'Подъём', categoryIds: ['crane', 'agp'] },
];

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

describe('widenToGroups', () => {
  it('adds the other categories of the same group only', () => {
    expect(widenToGroups(['backhoe'], groups).sort()).toEqual(['backhoe', 'excavator']);
    expect(widenToGroups(['other'], groups)).toEqual(['other']);
  });
});

describe('matchIncoming', () => {
  const kazan = { lat: 55.79, lon: 49.12 };
  const orders = [
    { id: 'same-group', categoryId: 'excavator', ...kazan },
    { id: 'any', categoryId: null, ...kazan },
    { id: 'other-group', categoryId: 'crane', ...kazan },
    // Moscow, ~720 km from Kazan.
    { id: 'far', categoryId: 'backhoe', lat: 55.75, lon: 37.62 },
    { id: 'no-point', categoryId: 'backhoe' },
  ];

  it('matches by category group and the delivery radius', () => {
    const company = { categoryIds: ['backhoe'], baseLat: 55.8, baseLon: 49.1, radiusKm: 100 };
    expect(matchIncoming(company, groups, orders).map((order) => order.id)).toEqual([
      'same-group',
      'any',
      'no-point',
    ]);
  });

  it('shows every order to a company without machinery yet', () => {
    expect(matchIncoming({ categoryIds: [] }, groups, orders)).toHaveLength(orders.length);
  });
});
