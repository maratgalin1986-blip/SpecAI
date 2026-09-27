import { describe, expect, it } from 'vitest';
import {
  MOBILE_TOKEN_TTL_SEC,
  isMobileTokenRevoked,
  signMobileToken,
  verifyMobileToken,
} from './mobileAuth';

const secret = 'test-secret-for-mobile-tokens';
const now = 1_800_000_000;

describe('mobile token', () => {
  it('signs and verifies a valid token with the expected claims', async () => {
    const token = await signMobileToken({ userId: 'user_1', role: 'CUSTOMER' }, { secret, now });
    const claims = await verifyMobileToken(token, { secret, now: now + 60 });
    expect(claims).toEqual({
      userId: 'user_1',
      role: 'CUSTOMER',
      iat: now,
      exp: now + MOBILE_TOKEN_TTL_SEC,
    });
  });

  it('rejects an expired token', async () => {
    const token = await signMobileToken({ userId: 'user_1', role: 'CUSTOMER' }, { secret, now });
    await expect(
      verifyMobileToken(token, { secret, now: now + MOBILE_TOKEN_TTL_SEC + 1 }),
    ).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret or tampered with', async () => {
    const token = await signMobileToken({ userId: 'user_1', role: 'CUSTOMER' }, { secret, now });
    await expect(verifyMobileToken(token, { secret: 'other', now })).resolves.toBeNull();
    await expect(verifyMobileToken(token + 'x', { secret, now })).resolves.toBeNull();
    await expect(verifyMobileToken('not-a-jwt', { secret, now })).resolves.toBeNull();
  });

  it('treats a token issued before the password change as revoked', async () => {
    const token = await signMobileToken({ userId: 'user_1', role: 'CUSTOMER' }, { secret, now });
    const claims = await verifyMobileToken(token, { secret, now: now + 10 });
    expect(claims).not.toBeNull();
    expect(isMobileTokenRevoked(claims!, new Date((now + 5) * 1000))).toBe(true);
    expect(isMobileTokenRevoked(claims!, new Date((now - 5) * 1000))).toBe(false);
    expect(isMobileTokenRevoked(claims!, null)).toBe(false);
  });
});
