import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// POST /api/auth/forgot-password: the limits count every answer, whether the
// letters are switched on or off.

const emailFeatures = vi.fn();
const findUserByEmail = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { verificationToken: { create: vi.fn() } } }));
vi.mock('@/lib/findUserByEmail', () => ({ findUserByEmail }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/emailFeatures', () => ({
  emailFeatures,
  PASSWORD_RECOVERY_OFF_MESSAGE: 'Письма выключены',
}));

const { POST } = await import('./route');

function request(ip: string, email = 'anna@example.com') {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    emailFeatures.mockReset();
    findUserByEmail.mockReset().mockResolvedValue(null);
  });

  it('limits the requests of one address and e-mail while the letters are off', async () => {
    emailFeatures.mockReturnValue({ passwordRecovery: false });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await POST(request('10.9.0.1'))).status);
    expect(statuses).toEqual([503, 503, 503, 503, 503, 429]);
  });

  it('limits the requests of one address across e-mails while the letters are off', async () => {
    emailFeatures.mockReturnValue({ passwordRecovery: false });
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      last = (await POST(request('10.9.0.2', `user${i}@example.com`))).status;
    }
    expect(last).toBe(429);
  });

  it('answers ok for any e-mail when the letters are on', async () => {
    emailFeatures.mockReturnValue({ passwordRecovery: true });
    const response = await POST(request('10.9.0.3'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
