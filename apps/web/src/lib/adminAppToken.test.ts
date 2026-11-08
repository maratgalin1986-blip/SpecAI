import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => new Headers(),
}));

const { ADMIN_APP_TTL_SEC, issueAdminAppToken, isValidAdminAppToken } = await import('./admin');

describe('the app admin session', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'owner-password';
    process.env.NEXTAUTH_SECRET = 'secret';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('works until it expires', () => {
    const now = 1_790_000_000;
    const token = issueAdminAppToken(now)!;
    expect(token).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(token).not.toContain('owner-password');
    expect(isValidAdminAppToken(token, now + 60)).toBe(true);
    expect(isValidAdminAppToken(token, now + ADMIN_APP_TTL_SEC + 1)).toBe(false);
  });

  it('stops working when the password changes', () => {
    const token = issueAdminAppToken(1_790_000_000)!;
    process.env.ADMIN_PASSWORD = 'new-password';
    expect(isValidAdminAppToken(token, 1_790_000_100)).toBe(false);
  });

  it('refuses a forged or stretched expiry and garbage', () => {
    const now = 1_790_000_000;
    const [, , signature] = issueAdminAppToken(now)!.split('.');
    expect(isValidAdminAppToken(`v1.${now + 10 * ADMIN_APP_TTL_SEC}.${signature}`, now)).toBe(
      false,
    );
    expect(isValidAdminAppToken('v1.123.abc', now)).toBe(false);
    expect(isValidAdminAppToken(null, now)).toBe(false);
  });

  it('is off without ADMIN_PASSWORD', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(issueAdminAppToken()).toBeNull();
  });
});
