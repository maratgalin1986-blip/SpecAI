import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  booking: { findFirst: vi.fn() },
  bid: { findFirst: vi.fn() },
  company: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock('@specai/database', () => ({ prisma: db }));

import { commentAccessError, hasInteraction } from './commentAccess';
import { NO_INTERACTION_MESSAGE } from './comments';

const customer = { id: 'u1', role: 'CUSTOMER', companyId: null };
const provider = { id: 'p1', role: 'PROVIDER_ADMIN', companyId: 'c1' };

beforeEach(() => {
  vi.resetAllMocks();
  db.company.findUnique.mockResolvedValue({ isProvider: true });
  db.user.findUnique.mockResolvedValue({ id: 'u1' });
  db.booking.findFirst.mockResolvedValue(null);
  db.bid.findFirst.mockResolvedValue(null);
});

describe('hasInteraction', () => {
  it('looks for the customer’s booking or a bid between the two sides', async () => {
    db.booking.findFirst.mockResolvedValue({ id: 'b1' });
    expect(await hasInteraction(customer, { targetCompanyId: 'c1' })).toBe(true);
    expect(db.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'u1', equipment: { companyId: 'c1' } } }),
    );
  });

  it('for a provider writing about a customer, the customer is the target', async () => {
    db.bid.findFirst.mockResolvedValue({ id: 'bid1' });
    expect(await hasInteraction(provider, { targetUserId: 'u1' })).toBe(true);
    expect(db.bid.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { order: { customerId: 'u1' }, equipment: { companyId: 'c1' } },
      }),
    );
  });
});

describe('commentAccessError', () => {
  it('refuses without an interaction', async () => {
    expect(await commentAccessError(customer, { targetCompanyId: 'c1' })).toEqual({
      error: NO_INTERACTION_MESSAGE,
      status: 403,
    });
  });

  it('allows after a booking', async () => {
    db.booking.findFirst.mockResolvedValue({ id: 'b1' });
    expect(await commentAccessError(customer, { targetCompanyId: 'c1' })).toBeNull();
  });

  it('a guest gets 401, an unknown company 404', async () => {
    expect(await commentAccessError(null, { targetCompanyId: 'c1' })).toMatchObject({
      status: 401,
    });
    db.company.findUnique.mockResolvedValue(null);
    expect(await commentAccessError(customer, { targetCompanyId: 'zz' })).toMatchObject({
      status: 404,
    });
  });

  it('a customer cannot write about another customer', async () => {
    db.booking.findFirst.mockResolvedValue({ id: 'b1' });
    expect(await commentAccessError(customer, { targetUserId: 'u2' })).toMatchObject({
      status: 400,
    });
  });
});
