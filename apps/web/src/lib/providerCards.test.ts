import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID } from './fleet';
import {
  categoryPlural,
  cityOf,
  filterProviderCards,
  fleetSummary,
  isListed,
  parseProviderQuery,
  providerCities,
  providersHref,
  radiusLabel,
  sinceLabel,
  sortProviderCards,
  toProviderCard,
  type ProviderRow,
} from './providerCards';
import { EMPTY_STATS, type CompanyStats } from './reliability';

function row(overrides: Partial<ProviderRow> & Record<string, unknown> = {}): ProviderRow {
  return {
    id: 'comp1',
    name: 'ООО «Кран-Сервис»',
    verified: true,
    baseAddress: 'г. Елабуга, ул. Тойминская, 3',
    deliveryRadiusKm: 150,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    pinImageUrl: 'https://x.public.blob.vercel-storage.com/equipment/comp1/pin.jpg',
    location: { city: 'Казань' },
    equipment: [
      {
        name: 'КС-45717',
        imageUrls: ['https://x.public.blob.vercel-storage.com/equipment/comp1/a.jpg'],
        category: { id: 'cat-crane', name: 'Автокраны' },
      },
      {
        name: 'JCB 3CX',
        imageUrls: ['javascript:alert(1)', '/images/machines/backhoe-1.jpg'],
        category: { id: 'cat-backhoe', name: 'Экскаваторы-погрузчики' },
      },
      { name: 'КамАЗ', imageUrls: [], category: { id: 'cat-truck', name: 'Самосвалы' } },
      { name: 'Вышка', imageUrls: [], category: { id: 'cat-lift', name: 'Автовышки' } },
    ],
    ...overrides,
  };
}

const STATS: CompanyStats = {
  verified: true,
  bookings: { COMPLETED: 12, CANCELLED: 1, CONFIRMED: 2 },
  ratingSum: 47,
  ratingCount: 10,
  invitedProviders: 0,
};

const groupOf = (categoryId: string) =>
  categoryId === 'cat-crane' || categoryId === 'cat-lift' ? 'lifting' : 'earth';

describe('toProviderCard', () => {
  it('copies only safe fields: no phone, e-mail or street address', () => {
    const card = toProviderCard(
      row({ phone: '+7 917 000-00-00', website: 'kran.ru', taxId: '1650000000' }),
      STATS,
      { fallbackCity: 'Набережные Челны', groupOf },
    );
    const json = JSON.stringify(card);
    expect(json).not.toContain('917');
    expect(json).not.toContain('kran.ru');
    expect(json).not.toContain('1650000000');
    expect(json).not.toContain('Тойминская');
    expect(Object.keys(card)).not.toContain('baseAddress');
  });

  it('summarises trust, fleet, city and radius', () => {
    const card = toProviderCard(row(), STATS, { fallbackCity: 'Набережные Челны', groupOf });
    expect(card.verified).toBe(true);
    expect(card.rating).toBe(4.7);
    expect(card.ratingCount).toBe(10);
    expect(card.completed).toBe(12);
    expect(card.cancelLabel).toBe('Отмены 7%');
    expect(card.badges).toEqual(['Проверен', '★ 4.7 (10)', '12 заказов выполнено', 'Отмены 7%']);
    expect(card.city).toBe('Елабуга');
    expect(card.fleetCount).toBe(4);
    expect(card.fleetSummary).toBe('4 машины: краны, экскаваторы-погрузчики, самосвалы');
    expect(card.groupIds).toEqual(['lifting', 'earth']);
    expect(card.radiusLabel).toBe('Выезд до 150 км');
    expect(card.sinceLabel).toBe('с октября 2026');
    expect(card.href).toBe('/providers/comp1');
    expect(card.orderHref).toBe('/orders?provider=comp1');
    expect(card.isHouse).toBe(false);
  });

  it('keeps up to three displayable photos, the marker picture first', () => {
    const card = toProviderCard(row(), STATS, { fallbackCity: 'Набережные Челны' });
    expect(card.photos).toEqual([
      'https://x.public.blob.vercel-storage.com/equipment/comp1/pin.jpg',
      'https://x.public.blob.vercel-storage.com/equipment/comp1/a.jpg',
      '/images/machines/backhoe-1.jpg',
    ]);
    expect(card.groupIds).toEqual([]);
  });

  it('marks a new company without stats and the house fleet', () => {
    const card = toProviderCard(
      row({ id: HOUSE_COMPANY_ID, verified: false, equipment: [], baseAddress: null }),
      EMPTY_STATS,
      { fallbackCity: 'Набережные Челны' },
    );
    expect(card.isHouse).toBe(true);
    expect(card.badges).toEqual(['Новый на сервисе']);
    expect(card.fleetSummary).toBe('Техника пока не добавлена');
    expect(card.city).toBe('Казань');
    expect(card.cancelLabel).toBeNull();
  });
});

describe('helpers', () => {
  it('finds the base city in an address, then the location, then the fallback', () => {
    expect(cityOf('в Набережных Челнах, пр. Мира 1', null, 'X')).toBe('Набережные Челны');
    expect(cityOf('Казань, ул. Баумана', 'Елабуга', 'X')).toBe('Казань');
    expect(cityOf('ул. Ленина, 5', 'Нижнекамск', 'X')).toBe('Нижнекамск');
    expect(cityOf(null, '  ', 'Набережные Челны')).toBe('Набережные Челны');
  });

  it('pluralises the kinds of machinery', () => {
    expect(categoryPlural('Автокраны')).toBe('краны');
    expect(categoryPlural('Гусеничные экскаваторы')).toBe('экскаваторы');
    expect(categoryPlural('Что-то')).toBe('что-то');
    expect(fleetSummary(1, ['Автокраны', 'Автокраны'])).toBe('1 машина: краны');
    expect(fleetSummary(2, [])).toBe('2 машины');
  });

  it('labels the radius and the start month', () => {
    expect(radiusLabel(100)).toBe('Выезд до 100 км');
    expect(radiusLabel(0)).toBe('Выезд по договорённости');
    expect(sinceLabel(new Date('2026-01-15T00:00:00Z'))).toBe('с января 2026');
  });

  it('lists companies with a fleet or a base only', () => {
    expect(isListed({ baseAddress: null, equipment: [] })).toBe(false);
    expect(isListed({ baseAddress: ' ', equipment: [] })).toBe(false);
    expect(isListed({ baseAddress: 'Казань', equipment: [] })).toBe(true);
  });
});

describe('filtering and sorting', () => {
  const base = toProviderCard(row(), STATS, { fallbackCity: 'X', groupOf });
  const house = {
    ...base,
    id: HOUSE_COMPANY_ID,
    name: 'СпецПласт16',
    isHouse: true,
    rating: null,
    ratingCount: 0,
    fleetCount: 2,
    verified: false,
    city: 'Набережные Челны',
  };
  const other = {
    ...base,
    id: 'c2',
    name: 'Автопарк',
    verified: false,
    rating: 5,
    ratingCount: 1,
    fleetCount: 9,
    groupIds: ['earth'],
    city: 'Казань',
  };
  const cards = [other, base, house];

  it('puts the house fleet first, then verified, then by the chosen order', () => {
    expect(sortProviderCards(cards, 'rating').map((c) => c.id)).toEqual([
      HOUSE_COMPANY_ID,
      'comp1',
      'c2',
    ]);
    expect(
      sortProviderCards([other, { ...base, verified: false }], 'rating').map((c) => c.id),
    ).toEqual(['c2', 'comp1']);
    expect(
      sortProviderCards([other, { ...base, verified: false }], 'fleet').map((c) => c.id),
    ).toEqual(['c2', 'comp1']);
    const created = (card: { id: string }) => (card.id === 'c2' ? 1 : 2);
    expect(
      sortProviderCards([other, { ...base, verified: false }], 'newest', created).map((c) => c.id),
    ).toEqual(['comp1', 'c2']);
  });

  it('filters by group and city', () => {
    expect(filterProviderCards(cards, { group: 'lifting', city: null }).map((c) => c.id)).toEqual([
      'comp1',
      HOUSE_COMPANY_ID,
    ]);
    expect(filterProviderCards(cards, { group: null, city: 'казань' }).map((c) => c.id)).toEqual([
      'c2',
    ]);
    expect(providerCities(cards)).toEqual(['Елабуга', 'Казань', 'Набережные Челны']);
  });

  it('parses the query and builds links', () => {
    expect(parseProviderQuery({ group: 'lifting', city: 'Казань', sort: 'fleet' })).toEqual({
      group: 'lifting',
      city: 'Казань',
      sort: 'fleet',
    });
    expect(parseProviderQuery({ group: '../x', sort: 'price' })).toEqual({
      group: null,
      city: null,
      sort: 'rating',
    });
    expect(providersHref({ sort: 'rating' })).toBe('/providers');
    expect(providersHref({ group: 'earth', sort: 'newest' })).toBe(
      '/providers?group=earth&sort=newest',
    );
  });
});
