import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_OUTSIDE_MESSAGE } from './providerMap';
import { BASE_CITY_MESSAGE, addressVariants, resolveProviderBase } from './providerBase';

const queries: URLSearchParams[] = [];

beforeEach(() => {
  queries.length = 0;
  // «пр. Мира 10» alone matches a проезд in Armavir; with the city it is in Челны.
  vi.stubGlobal('fetch', async (url: string) => {
    const params = new URL(url).searchParams;
    queries.push(params);
    const q = params.get('q') ?? '';
    const hit = q.includes('Набережные Челны')
      ? { lat: '55.74', lon: '52.4', display_name: q }
      : { lat: '44.99', lon: '41.12', display_name: q };
    return new Response(JSON.stringify([hit]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('addressVariants', () => {
  it('never adds a default town to a street without one', () => {
    const variants = addressVariants('пр. Мира 10');
    expect(variants).toEqual(['проспект Мира 10', 'пр. Мира 10']);
    expect(variants.some((v) => /Челны|Татарстан/.test(v))).toBe(false);
  });

  it('puts the bias town first for a street without one', () => {
    expect(addressVariants('пр. Мира 10', 'Казань')[0]).toBe('проспект Мира 10, Казань');
    // «Мира» alone: a street typed without the city, not a town.
    expect(addressVariants('Мира', 'Самара')[0]).toBe('Мира, Самара');
    expect(addressVariants('пр-т Мира, 10', 'Пермь')[0]).toBe('проспект Мира, 10, Пермь');
    expect(addressVariants('ул Мира 10', 'Пермь')).toEqual([
      'улица Мира 10, Пермь',
      'улица Мира 10',
      'ул Мира 10',
    ]);
  });

  it('keeps an address that names its town as it is, whatever the bias', () => {
    const variants = addressVariants('Казань, ул. Декабристов 1', 'Пермь');
    expect(variants).toEqual(['Казань, ул. Декабристов 1', 'Казань, улица Декабристов 1']);
    // A comma part without digits or street words names a town, known or not.
    expect(addressVariants('Москва, Тверская 3', 'Пермь')[0]).toBe('Москва, Тверская 3');
    expect(addressVariants('Бавлы, Мира 5', 'Пермь')[0]).toBe('Бавлы, Мира 5');
    expect(addressVariants('ул. Ленина 5 в Самаре', 'Пермь')[0]).toBe('ул. Ленина 5 в Самаре');
  });
});

describe('resolveProviderBase', () => {
  it('geocodes an address that names its town, without a bias', async () => {
    const result = await resolveProviderBase({ baseAddress: 'Набережные Челны, пр. Мира 10' });
    expect(result).toMatchObject({ ok: true, value: { baseLat: 55.74, baseLon: 52.4 } });
    expect(queries[0]?.get('viewbox')).toBeNull();
    expect(queries[0]?.get('countrycodes')).toBe('ru');
  });

  it('asks for the town instead of guessing one for a bare street', async () => {
    const result = await resolveProviderBase({ baseAddress: 'пр. Мира 10' });
    expect(result).toEqual({ ok: false, error: BASE_CITY_MESSAGE });
    expect(queries).toHaveLength(0);
  });

  it('takes the town around the phone for a bare street', async () => {
    // Near Набережные Челны: the known city within 30 km goes first.
    const result = await resolveProviderBase({ baseAddress: 'пр. Мира 10', near: '55.73,52.41' });
    expect(result).toMatchObject({ ok: true, value: { baseLat: 55.74, baseLon: 52.4 } });
    expect(queries[0]?.get('q')).toBe('проспект Мира 10, Набережные Челны');
    expect(queries[0]?.get('viewbox')).toBe('51.90,56.05,52.90,55.45');
  });

  it('asks for the town when the street exists only far from the phone', async () => {
    // The phone is in Perm; «пр. Мира 10» is found only in Armavir.
    const result = await resolveProviderBase({ baseAddress: 'пр. Мира 10', near: '58.0,56.25' });
    expect(result).toEqual({ ok: false, error: BASE_CITY_MESSAGE });
    expect(queries.map((params) => params.get('q'))).toEqual([
      'проспект Мира 10, Пермь',
      'проспект Мира 10',
      'пр. Мира 10',
    ]);
  });

  it('keeps a picked point and its address, and refuses a point outside Russia', async () => {
    expect(
      await resolveProviderBase({
        baseAddress: 'Екатеринбург, база',
        baseLat: 56.84,
        baseLon: 60.61,
      }),
    ).toEqual({
      ok: true,
      value: { baseLat: 56.84, baseLon: 60.61, baseAddress: 'Екатеринбург, база' },
    });
    expect(await resolveProviderBase({ baseLat: 48.85, baseLon: 2.35 })).toEqual({
      ok: false,
      error: BASE_OUTSIDE_MESSAGE,
    });
  });
});
