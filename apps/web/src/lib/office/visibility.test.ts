import { describe, expect, it } from 'vitest';
import { isValidSlug, isValidToken, visibleFor } from './visibility';

const STATUSES = [
  'NEW',
  'READY',
  'CONTACTED',
  'CALLBACK',
  'AGREED',
  'PUBLISHED',
  'DECLINED',
  'REGISTERED',
] as const;

describe('visibleFor', () => {
  it('preview: every status but DECLINED, whatever the kind', () => {
    for (const kind of ['site', 'provider']) {
      for (const status of STATUSES) {
        expect(visibleFor({ kind, status }, 'preview')).toBe(status !== 'DECLINED');
      }
    }
  });

  it('site: only a site prospect that is PUBLISHED', () => {
    for (const status of STATUSES) {
      expect(visibleFor({ kind: 'site', status }, 'site')).toBe(status === 'PUBLISHED');
      expect(visibleFor({ kind: 'provider', status }, 'site')).toBe(false);
    }
  });

  it('provider: a provider prospect that is PUBLISHED or REGISTERED', () => {
    for (const status of STATUSES) {
      expect(visibleFor({ kind: 'provider', status }, 'provider')).toBe(
        status === 'PUBLISHED' || status === 'REGISTERED',
      );
      expect(visibleFor({ kind: 'site', status }, 'provider')).toBe(false);
    }
  });

  it('a declined page is gone everywhere (R12)', () => {
    for (const route of ['preview', 'site', 'provider'] as const) {
      expect(visibleFor({ kind: 'site', status: 'DECLINED' }, route)).toBe(false);
      expect(visibleFor({ kind: 'provider', status: 'DECLINED' }, route)).toBe(false);
    }
  });

  it('an unknown kind is never public', () => {
    expect(visibleFor({ kind: 'other', status: 'PUBLISHED' }, 'site')).toBe(false);
    expect(visibleFor({ kind: 'other', status: 'PUBLISHED' }, 'provider')).toBe(false);
  });
});

describe('route parameters', () => {
  it('accepts a slug of 3–80 lower-case letters, digits and hyphens', () => {
    expect(isValidSlug('ulybka-kazan')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('a'.repeat(80))).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(81))).toBe(false);
    expect(isValidSlug('Ulybka')).toBe(false);
    expect(isValidSlug('улыбка')).toBe(false);
    expect(isValidSlug('a_b')).toBe(false);
    expect(isValidSlug('a/b')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('accepts a token of exactly 32 lower-case hex characters', () => {
    expect(isValidToken('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isValidToken('0123456789ABCDEF0123456789ABCDEF')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcde')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcdef0')).toBe(false);
    expect(isValidToken('0123456789abcdef0123456789abcdeg')).toBe(false);
    expect(isValidToken('')).toBe(false);
  });
});
