import { describe, expect, it } from 'vitest';
import { cleanSearchParams, priceParam } from './catalogParams';

describe('catalogue query parameters', () => {
  it('keeps single strings and drops arrays, blanks and unknown keys', () => {
    expect(
      cleanSearchParams({ q: ['a', 'b'], city: '  Челны ', sort: '', company: 'p1', page: '2' }),
    ).toEqual({ city: 'Челны', page: '2' });
  });

  it('accepts only finite non-negative prices', () => {
    expect(priceParam('3300')).toBe(3300);
    expect(priceParam('0')).toBe(0);
    expect(priceParam('abc')).toBeUndefined();
    expect(priceParam('-5')).toBeUndefined();
    expect(priceParam('Infinity')).toBeUndefined();
    expect(priceParam(undefined)).toBeUndefined();
  });
});

describe('customer rates of a house machine', () => {
  it('never shows less than the price list, keeps a higher row', async () => {
    const { customerRates } = await import('./equipmentCatalog');
    expect(
      customerRates({
        name: 'КамАЗ',
        categoryName: 'Самосвал',
        hourlyRate: 2300,
        dailyRate: 18400,
      }),
    ).toEqual({ hourlyRate: 3300, dailyRate: 26400 });
    expect(
      customerRates({
        name: 'Кран 32 т',
        categoryName: 'Автокран',
        hourlyRate: 5500,
        dailyRate: null,
      }),
    ).toEqual({ hourlyRate: 5500, dailyRate: 44000 });
  });
});
