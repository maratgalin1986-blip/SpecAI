import { describe, expect, it } from 'vitest';
import { generateRawToken, hashToken } from './tokens';

describe('hashToken', () => {
  it('is a deterministic sha256 hex digest', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs and never equals the raw token', () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).not.toBe(hashToken(raw + 'x'));
  });
});

describe('generateRawToken', () => {
  it('returns 64 hex chars and is unique per call', () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
