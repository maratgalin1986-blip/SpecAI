import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID as DB_HOUSE_ID } from '@specai/database';
import { HOUSE_COMPANY_ID, isHouseManager, isProvider, OWN_FLEET, PUBLIC_FLEET } from './fleet';

describe('aggregator roles', () => {
  it('uses the same company id as the database package', () => {
    expect(HOUSE_COMPANY_ID).toBe(DB_HOUSE_ID);
    expect(OWN_FLEET).toEqual({ companyId: DB_HOUSE_ID });
    expect(PUBLIC_FLEET).toEqual({ company: { isProvider: true } });
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
