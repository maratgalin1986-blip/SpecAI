import { describe, expect, it } from 'vitest';
import { addressVariants } from './providerBase';

describe('addressVariants', () => {
  it('expands street abbreviations and adds the city when none is given', () => {
    const variants = addressVariants('пр. Мира 10');
    expect(variants[0]).toBe('пр. Мира 10');
    expect(variants).toContain('проспект Мира 10');
    expect(variants).toContain('проспект Мира 10, Набережные Челны');
  });

  it('keeps a full address as is and only appends the republic', () => {
    const variants = addressVariants('Казань, ул. Декабристов 1');
    expect(variants).toContain('Казань, улица Декабристов 1');
    expect(variants.some((v) => v.endsWith('Набережные Челны'))).toBe(false);
  });
});
