import { describe, expect, it } from 'vitest';
import { parseEnumParam, parsePage, totalPagesFor } from './pagination';

describe('parsePage', () => {
  it('returns 1 for missing, non-numeric, zero or negative values', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-3')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
  });

  it('parses positive integers and takes the first of repeated params', () => {
    expect(parsePage('7')).toBe(7);
    expect(parsePage(['3', '9'])).toBe(3);
  });
});

describe('parseEnumParam', () => {
  const allowed = ['newest', 'price_asc'] as const;

  it('returns the value when it is allowed and the fallback otherwise', () => {
    expect(parseEnumParam('price_asc', allowed, 'newest')).toBe('price_asc');
    expect(parseEnumParam('random', allowed, 'newest')).toBe('newest');
    expect(parseEnumParam(undefined, allowed, 'newest')).toBe('newest');
  });
});

describe('totalPagesFor', () => {
  it('is never less than 1 and rounds up', () => {
    expect(totalPagesFor(0, 12)).toBe(1);
    expect(totalPagesFor(12, 12)).toBe(1);
    expect(totalPagesFor(13, 12)).toBe(2);
    expect(totalPagesFor(41, 20)).toBe(3);
  });
});
