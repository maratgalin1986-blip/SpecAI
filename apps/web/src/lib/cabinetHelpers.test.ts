import { describe, expect, it } from 'vitest';
import { offerBreakdown, orderDays } from './offerBreakdown';
import { orderPrefill, quickOrderHref, todayMsk } from './quickOrder';
import {
  jsonLdScript,
  providerJsonLd,
  providerMetaDescription,
  providerPath,
  type ProviderSeoInput,
} from './providerSeo';

describe('quick order', () => {
  const now = new Date('2026-10-02T09:00:00Z');

  it('«Нужна сейчас» opens today’s order with the type and address', () => {
    expect(
      quickOrderHref({ categoryId: 'cat-1', when: 'now', address: ' пр. Мира, 49 ' }, now),
    ).toBe(
      '/orders?category=cat-1&start=2026-10-02&now=1&address=%D0%BF%D1%80.+%D0%9C%D0%B8%D1%80%D0%B0%2C+49#new',
    );
  });

  it('«На дату» keeps a valid date and drops junk', () => {
    expect(quickOrderHref({ when: 'date', date: '2026-10-05' }, now)).toBe(
      '/orders?start=2026-10-05#new',
    );
    expect(quickOrderHref({ when: 'date', date: 'tomorrow', categoryId: 'a b' }, now)).toBe(
      '/orders#new',
    );
  });

  it('turns the params back into form values, refusing past dates', () => {
    expect(todayMsk(now)).toBe('2026-10-02');
    expect(orderPrefill({ category: 'cat-1', start: '2026-10-05', address: 'x' }, now)).toEqual({
      categoryId: 'cat-1',
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      address: 'x',
    });
    expect(orderPrefill({ start: '2026-09-01' }, now)).toEqual({});
    expect(orderPrefill({ now: '1' }, now)).toMatchObject({
      startDate: '2026-10-02',
      endDate: '2026-10-02',
      description: expect.stringContaining('сейчас'),
    });
  });
});

describe('offer breakdown', () => {
  it('counts both ends of the period', () => {
    expect(orderDays(new Date('2026-10-02'), new Date('2026-10-02'))).toBe(1);
    expect(orderDays(new Date('2026-10-02'), new Date('2026-10-04'))).toBe(3);
    expect(orderDays(new Date('2026-10-04'), new Date('2026-10-02'))).toBe(1);
  });

  it('splits the total per day and shows the card rates', () => {
    expect(
      offerBreakdown('54000', new Date('2026-10-02'), new Date('2026-10-04'), {
        hourlyRate: '2500',
        dailyRate: { toString: () => '20000' },
      }),
    ).toMatchObject({ total: 54000, days: 3, perDay: 18000, cardHour: 2500, cardShift: 20000 });
    expect(
      offerBreakdown(null, new Date('2026-10-02'), new Date('2026-10-02'), { hourlyRate: null }),
    ).toMatchObject({ total: 0, cardHour: null, cardShift: null });
  });
});

describe('provider SEO', () => {
  const input: ProviderSeoInput = {
    id: 'c1',
    name: 'ТехноСтрой',
    description: null,
    baseAddress: 'Набережные Челны, Промзона',
    baseLat: 55.7,
    baseLon: 52.4,
    rating: 4.75,
    ratingCount: 4,
    machines: [
      { name: 'JCB 3CX', category: 'Экскаваторы-погрузчики' },
      { name: 'Ивановец', category: 'Автокраны' },
    ],
    city: 'Набережные Челны',
    region: 'Республика Татарстан',
  };

  it('builds a LocalBusiness without contacts', () => {
    const ld = providerJsonLd(input, 'https://site.ru/');
    expect(ld['@type']).toBe('LocalBusiness');
    expect(ld.url).toBe('https://site.ru/providers/c1');
    expect(ld).not.toHaveProperty('telephone');
    expect(ld.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 55.7, longitude: 52.4 });
    expect(ld.aggregateRating).toMatchObject({ ratingValue: '4.8', reviewCount: 4 });
    expect((ld.hasOfferCatalog as { itemListElement: unknown[] }).itemListElement).toHaveLength(2);
  });

  it('omits rating and geo when unknown', () => {
    const ld = providerJsonLd(
      { ...input, rating: null, ratingCount: 0, baseLat: null, machines: [] },
      'https://site.ru',
    );
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('geo');
    expect(ld).not.toHaveProperty('hasOfferCatalog');
  });

  it('keeps the meta description short and the script safe', () => {
    const text = providerMetaDescription({ ...input, name: 'Я'.repeat(300) });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(providerMetaDescription(input)).toContain('экскаваторы-погрузчики');
    expect(jsonLdScript({ name: '</script><b>' })).not.toContain('</script>');
    expect(providerPath('a b')).toBe('/providers/a%20b');
  });
});
