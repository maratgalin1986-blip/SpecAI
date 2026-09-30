import { describe, expect, it } from 'vitest';
import { parseAbCookie, parseAbVariant, pickVariant } from './ab';

describe('ab', () => {
  it('picks 50/50', () => {
    expect(pickVariant(() => 0.1)).toBe('cine');
    expect(pickVariant(() => 0.9)).toBe('calm');
  });
  it('parses variants', () => {
    expect(parseAbVariant('calm')).toBe('calm');
    expect(parseAbVariant('x')).toBeNull();
    expect(parseAbVariant(undefined)).toBeNull();
  });
  it('parses the cookie string', () => {
    expect(parseAbCookie('a=1; sp_ab=calm; b=2')).toBe('calm');
    expect(parseAbCookie('sp_ab=cine')).toBe('cine');
    expect(parseAbCookie('xsp_ab=calm')).toBeNull();
    expect(parseAbCookie('sp_ab=bad')).toBeNull();
    expect(parseAbCookie('')).toBeNull();
  });
});
