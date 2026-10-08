import { describe, expect, it } from 'vitest';
import { AB_INLINE, parseAbVariant, pickVariant, readAbVariant } from './ab';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

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
  it('is «cine» by default and writes nothing without ?ab=', () => {
    const storage = memory();
    expect(readAbVariant('', storage)).toBe('cine');
    expect(readAbVariant('?utm_source=yandex', storage)).toBe('cine');
    expect(storage.data).toEqual({});
    expect(readAbVariant('?ab=bad', null)).toBe('cine');
  });
  it('?ab= switches the variant and is remembered in storage, not a cookie', () => {
    const storage = memory();
    expect(readAbVariant('?x=1&ab=calm', storage)).toBe('calm');
    expect(storage.data).toEqual({ sp_ab: 'calm' });
    expect(readAbVariant('', storage)).toBe('calm');
    expect(readAbVariant('?ab=cine', storage)).toBe('cine');
  });
  it('the inline ES5 version agrees', () => {
    const run = (search: string, storage: ReturnType<typeof memory>) =>
      new Function('location', 'localStorage', `${AB_INLINE};return ab;`)({ search }, storage);
    expect(run('', memory())).toBe('cine');
    expect(run('', memory({ sp_ab: 'calm' }))).toBe('calm');
    const storage = memory();
    expect(run('?ab=calm', storage)).toBe('calm');
    expect(storage.data).toEqual({ sp_ab: 'calm' });
  });
});
