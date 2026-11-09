import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import { SITE_PRICES, siteYearlyPrice, sitePackages } from '@/lib/prices';
import { parseOfficePrices, SITE_YEARLY_SETTING } from './prices';

describe('office prices: parseOfficePrices', () => {
  it('falls back to SITE_PRICES when nothing is set', () => {
    expect(parseOfficePrices([])).toEqual({
      setup: SITE_PRICES.setup,
      monthly: SITE_PRICES.monthly,
      yearly: SITE_PRICES.yearly,
    });
  });

  it('default prices of the business plan: 3 900, 990 a month, 9 900 a year', () => {
    expect(SITE_PRICES).toEqual({ setup: 3900, monthly: 990, yearly: 9900 });
    expect(SITE_PRICES.yearly).toBeLessThan(SITE_PRICES.monthly * 12);
  });

  it('reads positive integers from AppSetting rows', () => {
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '20000' },
        { key: 'office.siteMonthly', value: ' 2 000 ' },
        { key: 'office.siteYearly', value: '20 000' },
        { key: 'office.plan', value: 'providers; machinery; Казань' },
      ]),
    ).toEqual({ setup: 20000, monthly: 2000, yearly: 20000 });
    expect(SITE_YEARLY_SETTING).toBe('office.siteYearly');
  });

  it('a year without its own setting: the default year at the default month, else 12 months', () => {
    expect(parseOfficePrices([{ key: 'office.siteMonthly', value: '1500' }]).yearly).toBe(18000);
    expect(parseOfficePrices([{ key: 'office.sitePrice', value: '5000' }]).yearly).toBe(
      SITE_PRICES.yearly,
    );
  });

  it('a year is never dearer than twelve months', () => {
    expect(
      parseOfficePrices([
        { key: 'office.siteMonthly', value: '500' },
        { key: 'office.siteYearly', value: '9900' },
      ]).yearly,
    ).toBe(6000);
  });

  it('ignores zero, negative, fractional and garbage values one by one', () => {
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '0' },
        { key: 'office.siteMonthly', value: '1200' },
      ]),
    ).toEqual({ setup: SITE_PRICES.setup, monthly: 1200, yearly: 14400 });
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '-5' },
        { key: 'office.siteMonthly', value: '12.5' },
        { key: 'office.siteYearly', value: 'дёшево' },
      ]),
    ).toEqual({
      setup: SITE_PRICES.setup,
      monthly: SITE_PRICES.monthly,
      yearly: SITE_PRICES.yearly,
    });
    expect(parseOfficePrices([{ key: 'office.sitePrice', value: 'дорого' }]).setup).toBe(
      SITE_PRICES.setup,
    );
  });
});

describe('siteYearlyPrice and the packages «на год»', () => {
  it('the base month gets the base year; another month — the same discount, rounded', () => {
    const base = { monthly: 990, yearly: 9900 };
    expect(siteYearlyPrice(990, base)).toBe(9900);
    expect(siteYearlyPrice(1500, base)).toBe(15000);
    expect(siteYearlyPrice(0, base)).toBe(0);
    expect(siteYearlyPrice(990, { monthly: 990 })).toBe(11880);
  });

  it('every package carries the yearly price', () => {
    const packages = sitePackages(SITE_PRICES);
    expect(packages.map((p) => p.yearly)).toEqual([9900, 9900]);
    expect(sitePackages({ setup: 3900, monthly: 990 }).every((p) => p.yearly === 11880)).toBe(true);
  });
});
