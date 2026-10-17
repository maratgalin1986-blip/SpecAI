import { describe, expect, it } from 'vitest';
import { digestItem, digestsForCompanies, tomorrowRange } from './eveningDigest';

describe('tomorrowRange', () => {
  it('is the next Moscow calendar day', () => {
    // 19:00 Moscow on the 8th.
    const range = tomorrowRange(new Date('2026-10-08T16:00:00Z'));
    expect(range.key).toBe('2026-10-09');
    expect(range.start.toISOString()).toBe('2026-10-08T21:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-09T21:00:00.000Z');
  });

  it('handles the last hours of a Moscow day', () => {
    // 00:30 Moscow on the 9th (21:30 UTC on the 8th): tomorrow is the 10th.
    expect(tomorrowRange(new Date('2026-10-08T21:30:00Z')).key).toBe('2026-10-10');
  });
});

describe('digestsForCompanies', () => {
  const chelny = { lat: 55.74, lon: 52.4 };
  const orders = [
    {
      id: 'o1',
      customerId: 'cust',
      categoryId: 'exc',
      categoryName: 'Экскаватор',
      city: 'Елабуга',
      lat: 55.75,
      lon: 52.07,
    },
    {
      id: 'o2',
      customerId: 'cust',
      categoryId: 'crane',
      categoryName: 'Автокран',
      city: 'Набережные Челны',
      ...chelny,
    },
    {
      id: 'far',
      customerId: 'cust',
      categoryId: 'exc',
      categoryName: 'Экскаватор',
      city: 'Казань',
      lat: 55.79,
      lon: 49.12,
    },
  ];

  it('gives each company the orders of its categories within its radius', () => {
    const digests = digestsForCompanies(
      [
        {
          id: 'c1',
          userIds: ['u1', 'u2'],
          categoryIds: ['exc', 'crane'],
          baseLat: chelny.lat,
          baseLon: chelny.lon,
          radiusKm: 100,
        },
        // No base coordinates: matched by the city its address names.
        {
          id: 'c2',
          userIds: ['u3'],
          categoryIds: ['crane'],
          baseLat: null,
          baseLon: null,
          baseAddress: 'Набережные Челны, Промзона',
        },
        { id: 'own', userIds: ['cust'], categoryIds: ['exc'] },
        { id: 'none', userIds: ['u4'], categoryIds: ['truck'] },
        { id: 'nobody', userIds: [], categoryIds: ['exc'] },
      ],
      orders,
    );
    expect(digests).toEqual([
      {
        companyId: 'c1',
        userIds: ['u1', 'u2'],
        items: ['экскаватор, Елабуга', 'автокран, Набережные Челны'],
      },
      { companyId: 'c2', userIds: ['u3'], items: ['автокран, Набережные Челны'] },
    ]);
  });

  it('names the home city for an order without an address', () => {
    expect(digestItem({ categoryName: null, city: null })).toBe('техника, Набережные Челны');
  });

  it('tells orders apart by the excerpt and the dates', () => {
    expect(
      digestItem({
        categoryName: 'Экскаваторы гусеничные',
        city: 'Бавлы',
        description:
          'Нужен экскаватор, копать траншею 100 м под кабель, звоните +7 917 123-45-67.\n\nЗаявка найдена в открытом чате «Стройчат». Автор может попросить удалить её — как это сделать, сказано на странице заявки.',
        startDate: new Date('2026-10-17T00:00:00Z'),
        endDate: new Date('2026-10-19T00:00:00Z'),
      }),
    ).toBe('экскаваторы гусеничные, Бавлы, 17.10–19.10: Нужен экскаватор, копать траншею 100 м…');
    // A one-day job shows no dates (the digest is about tomorrow anyway).
    expect(
      digestItem({
        categoryName: 'Автокран',
        city: 'Казань',
        description: 'Поднять плиты',
        startDate: new Date('2026-10-17T00:00:00Z'),
        endDate: new Date('2026-10-17T00:00:00Z'),
      }),
    ).toBe('автокран, Казань: Поднять плиты');
  });
});
