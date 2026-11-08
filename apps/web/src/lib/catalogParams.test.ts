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
    ).toEqual({ hourlyRate: 3300, dailyRate: 26400, weeklyRate: null, monthlyRate: null });
    expect(
      customerRates({
        name: 'Кран 32 т',
        categoryName: 'Автокран',
        hourlyRate: 5500,
        dailyRate: null,
      }),
    ).toEqual({ hourlyRate: 5500, dailyRate: 44000, weeklyRate: null, monthlyRate: null });
  });

  it('keeps a weekly or monthly discount above the working days at list price', async () => {
    const { customerRates } = await import('./equipmentCatalog');
    const rates = customerRates({
      name: 'КамАЗ',
      categoryName: 'Самосвал',
      hourlyRate: 3300,
      weeklyRate: 100000,
      monthlyRate: 900000,
    });
    expect(rates.weeklyRate).toBe(26400 * 5);
    expect(rates.monthlyRate).toBe(900000);
  });

  it('floors the house fleet when its companyId is given', async () => {
    const { customerRates } = await import('./equipmentCatalog');
    const { HOUSE_COMPANY_ID } = await import('./fleet');
    expect(
      customerRates({
        name: 'КамАЗ',
        categoryName: 'Самосвал',
        companyId: HOUSE_COMPANY_ID,
        hourlyRate: 2300,
      }),
    ).toEqual({ hourlyRate: 3300, dailyRate: 26400, weeklyRate: null, monthlyRate: null });
  });
});

describe('customer rates of another provider', () => {
  it('shows the provider own rates, below the house price list too', async () => {
    const { customerRates } = await import('./equipmentCatalog');
    expect(
      customerRates({
        name: 'КамАЗ',
        categoryName: 'Самосвал',
        companyId: 'ckprovider1',
        hourlyRate: 2300,
        dailyRate: 17000,
        weeklyRate: 80000,
        monthlyRate: 300000,
      }),
    ).toEqual({ hourlyRate: 2300, dailyRate: 17000, weeklyRate: 80000, monthlyRate: 300000 });
  });

  it('derives the hour from the shift and the shift from the hour', async () => {
    const { customerRates } = await import('./equipmentCatalog');
    expect(
      customerRates({
        name: 'JCB',
        categoryName: 'Экскаватор',
        companyId: 'ck1',
        dailyRate: 24000,
      }),
    ).toEqual({ hourlyRate: 3000, dailyRate: 24000, weeklyRate: null, monthlyRate: null });
    expect(
      customerRates({
        name: 'JCB',
        categoryName: 'Экскаватор',
        companyId: 'ck1',
        hourlyRate: '2500',
      }),
    ).toEqual({ hourlyRate: 2500, dailyRate: 20000, weeklyRate: null, monthlyRate: null });
    expect(
      customerRates({
        name: 'JCB',
        categoryName: 'Экскаватор',
        companyId: 'ck1',
        hourlyRate: null,
      }),
    ).toEqual({ hourlyRate: 0, dailyRate: 0, weeklyRate: null, monthlyRate: null });
  });
});
