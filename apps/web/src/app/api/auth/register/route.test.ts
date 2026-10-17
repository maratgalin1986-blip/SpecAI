import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const userCreate = vi.fn();
const tx = { user: { create: userCreate }, company: { create: vi.fn() } };
vi.mock('@specai/database', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock('@/lib/findUserByEmail', () => ({ findUserByEmail: vi.fn(async () => null) }));
vi.mock('@/lib/verificationEmail', () => ({ sendVerificationEmail: vi.fn() }));
vi.mock('@/lib/referralStore', () => ({
  findReferrer: vi.fn(async () => null),
  freeReferralCode: vi.fn(async () => 'CODE1'),
}));
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
