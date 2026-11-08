import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const userCreate = vi.fn();
const tx = { user: { create: userCreate }, company: { create: vi.fn() } };
vi.mock('@specai/database', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock('@/lib/findUserByEmail', () => ({ findUserByEmail: vi.fn(async () => null) }));
vi.mock('@/lib/verificationEmail', () => ({ sendVerificationEmail: vi.fn() }));
const findReferrer = vi.fn(
  async (_code: unknown): Promise<{ id: string; role: string } | null> => null,
);
const grantReferralPriority = vi.fn();
const notifyUser = vi.fn();
vi.mock('@/lib/referralStore', () => ({
  findReferrer,
  freeReferralCode: vi.fn(async () => 'CODE1'),
  grantReferralPriority,
}));
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyUser }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hash') } }));

const { POST } = await import('./route');

function register(extra: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        accountType: 'CUSTOMER',
        name: 'Анна',
        email: 'anna@example.com',
        password: 'password123',
        consent: true,
        ...extra,
      }),
    }),
  );
}

describe('POST /api/auth/register: the newsletter box', () => {
  beforeEach(() => {
    userCreate.mockReset();
    userCreate.mockImplementation(async ({ data }) => ({ id: 'u1', email: data.email }));
  });

  it('subscribes only when the box was ticked', async () => {
    expect((await register({ newsConsent: true })).status).toBe(201);
    expect(userCreate.mock.calls[0]?.[0].data.newsConsentAt).toBeInstanceOf(Date);
  });

  it('does not subscribe by default or on anything but true', async () => {
    for (const extra of [{}, { newsConsent: false }, { newsConsent: 'true' }]) {
      userCreate.mockClear();
      expect((await register(extra)).status).toBe(201);
      expect(userCreate.mock.calls[0]?.[0].data.newsConsentAt).toBeNull();
    }
  });
});

describe('POST /api/auth/register: «Пригласи друга»', () => {
  beforeEach(() => {
    userCreate.mockReset();
    userCreate.mockImplementation(async ({ data }) => ({ id: 'friend', email: data.email }));
    findReferrer.mockReset();
    findReferrer.mockResolvedValue(null);
    grantReferralPriority.mockReset();
    notifyUser.mockReset();
  });

  it('gives the inviter the bonus and tells him until when', async () => {
    findReferrer.mockResolvedValue({ id: 'inviter', role: 'PROVIDER_ADMIN' });
    const until = new Date('2026-10-24T09:00:00Z');
    grantReferralPriority.mockResolvedValue({ until, role: 'PROVIDER_ADMIN' });
    expect((await register({ ref: 'K7M2QXA' })).status).toBe(201);
    expect(findReferrer).toHaveBeenCalledWith('K7M2QXA');
    expect(userCreate.mock.calls[0]?.[0].data.referredById).toBe('inviter');
    expect(grantReferralPriority).toHaveBeenCalledWith('inviter', 'friend');
    expect(notifyUser).toHaveBeenCalledWith('inviter', {
      type: 'referral.bonus',
      until,
      provider: true,
    });
  });

  it('grants nothing without a valid code', async () => {
    expect((await register({ ref: 'nonsense' })).status).toBe(201);
    expect(userCreate.mock.calls[0]?.[0].data.referredById).toBeUndefined();
    expect(grantReferralPriority).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('stays silent when nothing was granted, and a failure never fails the sign-up', async () => {
    findReferrer.mockResolvedValue({ id: 'inviter', role: 'CUSTOMER' });
    grantReferralPriority.mockResolvedValue(null);
    expect((await register({ ref: 'K7M2QXA' })).status).toBe(201);
    expect(notifyUser).not.toHaveBeenCalled();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    grantReferralPriority.mockRejectedValue(new Error('db down'));
    expect((await register({ ref: 'K7M2QXA' })).status).toBe(201);
  });
});
