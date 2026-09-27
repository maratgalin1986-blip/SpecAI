import { describe, expect, it } from 'vitest';
import { isTokenIssuedBeforePasswordChange } from './passwordChanged';

describe('isTokenIssuedBeforePasswordChange', () => {
  const iat = 1_700_000_000; // секунды

  it('is false without iat or without a password change', () => {
    expect(isTokenIssuedBeforePasswordChange(undefined, new Date())).toBe(false);
    expect(isTokenIssuedBeforePasswordChange(iat, null)).toBe(false);
    expect(isTokenIssuedBeforePasswordChange(iat, undefined)).toBe(false);
  });

  it('invalidates tokens issued before the password change', () => {
    expect(isTokenIssuedBeforePasswordChange(iat, new Date((iat + 1) * 1000))).toBe(true);
    expect(isTokenIssuedBeforePasswordChange(iat, new Date((iat + 3600) * 1000))).toBe(true);
  });

  it('keeps tokens issued in the same second or later', () => {
    expect(isTokenIssuedBeforePasswordChange(iat, new Date(iat * 1000 + 999))).toBe(false);
    expect(isTokenIssuedBeforePasswordChange(iat, new Date((iat - 1) * 1000))).toBe(false);
  });
});
