import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { user: { findUnique, updateMany } } }));

const { grantReferralPriority } = await import('./referralStore');

const DAY = 86_400_000;
const NOW = new Date('2026-10-17T09:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

describe('grantReferralPriority', () => {
  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockReset();
  });

  it('gives the inviter a week and writes it only over the value it read', async () => {
    findUnique.mockResolvedValue({ priorityUntil: null, role: 'PROVIDER_ADMIN' });
    updateMany.mockResolvedValue({ count: 1 });
    expect(await grantReferralPriority('inviter', 'friend', NOW)).toEqual({
      until: days(7),
      role: 'PROVIDER_ADMIN',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'inviter', priorityUntil: null },
      data: { priorityUntil: days(7) },
    });
  });

  it('stacks on a running bonus and stops at 30 days ahead', async () => {
    findUnique.mockResolvedValue({ priorityUntil: days(10), role: 'CUSTOMER' });
    updateMany.mockResolvedValue({ count: 1 });
    expect((await grantReferralPriority('inviter', 'friend', NOW))?.until).toEqual(days(17));
    findUnique.mockResolvedValue({ priorityUntil: days(27), role: 'CUSTOMER' });
    expect((await grantReferralPriority('inviter', 'friend', NOW))?.until).toEqual(days(30));
  });

  it('re-reads when another sign-up changed the date in between', async () => {
    findUnique
      .mockResolvedValueOnce({ priorityUntil: null, role: 'PROVIDER_ADMIN' })
      .mockResolvedValueOnce({ priorityUntil: days(7), role: 'PROVIDER_ADMIN' });
    updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect((await grantReferralPriority('inviter', 'friend', NOW))?.until).toEqual(days(14));
  });

  it('grants nothing without an inviter, to the new account itself, or to a deleted one', async () => {
    expect(await grantReferralPriority(null, 'friend', NOW)).toBeNull();
    expect(await grantReferralPriority('same', 'same', NOW)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(null);
    expect(await grantReferralPriority('gone', 'friend', NOW)).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
