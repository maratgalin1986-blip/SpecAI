import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import { SITE_PRICES } from '@/lib/prices';
import { parseOfficePrices } from './prices';

describe('office prices: parseOfficePrices', () => {
  it('falls back to SITE_PRICES when nothing is set', () => {
    expect(parseOfficePrices([])).toEqual({
      setup: SITE_PRICES.setup,
      monthly: SITE_PRICES.monthly,
    });
  });

  it('reads positive integers from AppSetting rows', () => {
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '20000' },
        { key: 'office.siteMonthly', value: ' 2 000 ' },
        { key: 'office.plan', value: 'providers; machinery; Казань' },
      ]),
    ).toEqual({ setup: 20000, monthly: 2000 });
  });

  it('ignores zero, negative, fractional and garbage values one by one', () => {
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '0' },
        { key: 'office.siteMonthly', value: '1200' },
      ]),
    ).toEqual({ setup: SITE_PRICES.setup, monthly: 1200 });
    expect(
      parseOfficePrices([
        { key: 'office.sitePrice', value: '-5' },
        { key: 'office.siteMonthly', value: '12.5' },
      ]),
    ).toEqual({ setup: SITE_PRICES.setup, monthly: SITE_PRICES.monthly });
    expect(parseOfficePrices([{ key: 'office.sitePrice', value: 'дорого' }]).setup).toBe(
      SITE_PRICES.setup,
    );
  });
});
