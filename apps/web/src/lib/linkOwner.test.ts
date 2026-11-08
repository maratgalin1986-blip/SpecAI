import { describe, expect, it } from 'vitest';
import { linkOwnerDecision, roleLabel } from './linkOwner';

const HOUSE = 'specplast16-house';

describe('linkOwnerDecision', () => {
  it('refuses an account that manages another provider company', () => {
    const decision = linkOwnerDecision(
      { role: 'PROVIDER_ADMIN', companyId: 'other', companyName: 'Кран-Сервис', orders: 0 },
      HOUSE,
    );
    expect(decision.kind).toBe('refuse');
    expect(decision.kind === 'refuse' && decision.error).toContain('Кран-Сервис');
  });

  it('refuses an operator of another company and the platform staff', () => {
    expect(
      linkOwnerDecision({ role: 'PROVIDER_OPERATOR', companyId: 'other', orders: 0 }, HOUSE).kind,
    ).toBe('refuse');
    expect(
      linkOwnerDecision({ role: 'PLATFORM_ADMIN', companyId: null, orders: 0 }, HOUSE).kind,
    ).toBe('refuse');
  });

  it('allows a customer, with a warning when there are orders', () => {
    expect(linkOwnerDecision({ role: 'CUSTOMER', companyId: null, orders: 0 }, HOUSE)).toEqual({
      kind: 'allow',
      warnings: [],
    });
    const withOrders = linkOwnerDecision({ role: 'CUSTOMER', companyId: null, orders: 3 }, HOUSE);
    expect(withOrders.kind === 'allow' && withOrders.warnings).toHaveLength(1);
  });

  it('knows an account that already manages the fleet', () => {
    expect(
      linkOwnerDecision({ role: 'PROVIDER_ADMIN', companyId: HOUSE, orders: 0 }, HOUSE).kind,
    ).toBe('already');
    // A house operator may be promoted.
    expect(
      linkOwnerDecision({ role: 'PROVIDER_OPERATOR', companyId: HOUSE, orders: 0 }, HOUSE).kind,
    ).toBe('allow');
  });

  it('labels roles in Russian', () => {
    expect(roleLabel('CUSTOMER')).toBe('заказчик');
  });
});
