import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID as DB_HOUSE_ID } from '@specai/database';
import { HOUSE_COMPANY_ID, isFleetManager, OWN_FLEET } from './fleet';

describe('single executor', () => {
  it('uses the same company id as the database package', () => {
    expect(HOUSE_COMPANY_ID).toBe(DB_HOUSE_ID);
    expect(OWN_FLEET).toEqual({ companyId: DB_HOUSE_ID });
  });

  it('treats only the owner fleet account as the provider', () => {
    expect(isFleetManager({ role: 'PROVIDER_ADMIN', companyId: HOUSE_COMPANY_ID })).toBe(true);
    expect(isFleetManager({ role: 'PROVIDER_ADMIN', companyId: 'other-co' })).toBe(false);
    expect(isFleetManager({ role: 'PROVIDER_ADMIN', companyId: null })).toBe(false);
    expect(isFleetManager({ role: 'CUSTOMER', companyId: HOUSE_COMPANY_ID })).toBe(false);
    expect(isFleetManager(null)).toBe(false);
    expect(isFleetManager(undefined)).toBe(false);
  });
});
