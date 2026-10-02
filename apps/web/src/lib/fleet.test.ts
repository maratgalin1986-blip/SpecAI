import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID as DB_HOUSE_ID } from '@specai/database';
import { HOUSE_COMPANY_ID, isHouseManager, isProvider, OWN_FLEET, PUBLIC_FLEET } from './fleet';

describe('aggregator roles', () => {
  it('uses the same company id as the database package', () => {
    expect(HOUSE_COMPANY_ID).toBe(DB_HOUSE_ID);
    expect(OWN_FLEET).toEqual({ companyId: DB_HOUSE_ID });
    expect(PUBLIC_FLEET).toEqual({ companyId: HOUSE_COMPANY_ID });
  });

  it('treats every provider account with a company as a provider', () => {
    expect(isProvider({ role: 'PROVIDER_ADMIN', companyId: HOUSE_COMPANY_ID })).toBe(true);
    expect(isProvider({ role: 'PROVIDER_ADMIN', companyId: 'other-co' })).toBe(true);
    expect(isProvider({ role: 'PROVIDER_ADMIN', companyId: null })).toBe(false);
    expect(isProvider({ role: 'CUSTOMER', companyId: 'other-co' })).toBe(false);
    expect(isProvider(null)).toBe(false);
  });

  it('keeps the house manager to the owner company', () => {
    expect(isHouseManager({ role: 'PROVIDER_ADMIN', companyId: HOUSE_COMPANY_ID })).toBe(true);
    expect(isHouseManager({ role: 'PROVIDER_ADMIN', companyId: 'other-co' })).toBe(false);
  });
});

describe('houseFirst', () => {
  it('puts СпецПласт16 first and keeps the rest in order', async () => {
    const { houseFirst, HOUSE_COMPANY_ID } = await import('./fleet');
    const items = [
      { id: 1, c: 'cabc' },
      { id: 2, c: HOUSE_COMPANY_ID },
      { id: 3, c: 'cxyz' },
    ];
    expect(houseFirst(items, (i) => i.c).map((i) => i.id)).toEqual([2, 1, 3]);
  });
  it('sorts the house id after cuids in descending order', async () => {
    const { HOUSE_COMPANY_ID } = await import('./fleet');
    expect([HOUSE_COMPANY_ID, 'ckz0abc', 'cm1xyz'].sort().reverse()[0]).toBe(HOUSE_COMPANY_ID);
  });
});
