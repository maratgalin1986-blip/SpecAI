import { describe, expect, it, vi } from 'vitest';

vi.mock('./geo', async (importOriginal) => {
  const real = await importOriginal<typeof import('./geo')>();
  return {
    ...real,
    // «пр. Мира 10» alone matches a проезд in Armavir; with the city it is in Челны.
    lookupAddress: vi.fn(async (query: string) =>
      query.endsWith('Набережные Челны')
        ? { status: 'found', place: { lat: 55.74, lon: 52.4, label: query } }
        : { status: 'found', place: { lat: 44.99, lon: 41.12, label: query } },
    ),
  };
});

import { addressVariants, resolveProviderBase } from './providerBase';

describe('addressVariants', () => {
  it('tries the address in Набережные Челны first when no city is given', () => {
    const variants = addressVariants('пр. Мира 10');
    expect(variants[0]).toBe('проспект Мира 10, Набережные Челны');
    expect(variants).toContain('проспект Мира 10');
    expect(variants).toContain('пр. Мира 10');
  });

  it('keeps a full address as is and only appends the republic', () => {
    const variants = addressVariants('Казань, ул. Декабристов 1');
    expect(variants[0]).toBe('Казань, ул. Декабристов 1');
    expect(variants).toContain('Казань, улица Декабристов 1');
    expect(variants.some((v) => v.endsWith('Набережные Челны'))).toBe(false);
  });
});

describe('resolveProviderBase', () => {
  it('takes the variant inside the service area, not a namesake far away', async () => {
    const result = await resolveProviderBase({ baseAddress: 'пр. Мира 10' });
    expect(result).toMatchObject({ ok: true, value: { baseLat: 55.74, baseLon: 52.4 } });
  });

  it('refuses an address found only outside the area', async () => {
    const result = await resolveProviderBase({ baseAddress: 'Бугульма, проезд Мира 10' });
    expect(result.ok).toBe(false);
  });
});
