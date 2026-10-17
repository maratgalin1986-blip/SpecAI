import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addressLabel,
  findAddress,
  geocodeAddress,
  viewboxAround,
  inServiceArea,
  parseNear,
  parsePhoton,
  lookupAddress,
  tileAllowed,
  formatCoords,
  shortLabel,
  TILE_SIZE,
  tilePosition,
  tilesAround,
} from './geo';

describe('tilePosition', () => {
  it('matches the Web Mercator tile scheme', () => {
    expect(tilePosition(0, 0, 1)).toEqual({ x: 1, y: 1 });
    const { x, y } = tilePosition(55.74, 52.4, 17);
    // Naberezhnye Chelny at zoom 17 (tile 17/84614/40983, centre of the city).
    expect(Math.floor(x)).toBe(84614);
    expect(Math.floor(y)).toBe(40983);
  });
});

describe('tilesAround', () => {
  it('covers a 5×3 block with the point at the origin', () => {
    const tiles = tilesAround(55.74, 52.4, 17);
    expect(tiles).toHaveLength(15);
    // The point lies inside the centre tile: its left/top are within one tile.
    const centre = tiles[7]!;
    expect(centre.left).toBeLessThanOrEqual(0);
    expect(centre.left).toBeGreaterThan(-TILE_SIZE);
    expect(centre.top).toBeLessThanOrEqual(0);
    expect(centre.top).toBeGreaterThan(-TILE_SIZE);
    expect(centre.src).toMatch(/^\/api\/tiles\/17\/\d+\/\d+$/);
  });
});

describe('labels', () => {
  it('shortens Nominatim display names', () => {
    expect(
      shortLabel(
        'Шалуны, 49А, проспект Мира, Новый город, Набережные Челны, городской округ Набережные Челны, Татарстан, Приволжский федеральный округ, 423812, Россия',
      ),
    ).toBe('Шалуны, 49А, проспект Мира, Новый город');
    expect(formatCoords(55.73989, 52.404497)).toBe('55.7399° с. ш., 52.4045° в. д.');
  });
});

describe('addressLabel', () => {
  it('builds «street, number, city» and ignores shop names', () => {
    expect(addressLabel({ road: 'проспект Мира', house_number: '49А' }, 'Набережные Челны')).toBe(
      'проспект Мира, 49А, Набережные Челны',
    );
    expect(addressLabel({}, 'Набережные Челны')).toBeNull();
  });
});

describe('tileAllowed', () => {
  it('serves street-level tiles in Naberezhnye Chelny', () => {
    const { x, y } = tilePosition(55.7436, 52.3959, 17);
    expect(tileAllowed(17, Math.floor(x), Math.floor(y))).toBe(true);
  });
  it('serves overview zooms of Russia for the maps', () => {
    for (const zoom of [3, 4, 6, 7, 8, 10]) {
      const { x, y } = tilePosition(55.7436, 52.3959, zoom);
      expect(tileAllowed(zoom, Math.floor(x), Math.floor(y))).toBe(true);
    }
    // Kazan at z9 as well.
    const { x, y } = tilePosition(55.7887, 49.1221, 9);
    expect(tileAllowed(9, Math.floor(x), Math.floor(y))).toBe(true);
  });
  it('serves cities all over Russia', () => {
    for (const [lat, lon] of [
      [55.7558, 37.6173], // Moscow
      [43.1155, 131.8855], // Vladivostok
      [54.7104, 20.4522], // Kaliningrad
      [64.7337, 177.5089], // Anadyr
    ] as const) {
      const { x, y } = tilePosition(lat, lon, 15);
      expect(tileAllowed(15, Math.floor(x), Math.floor(y))).toBe(true);
    }
  });
  it('refuses world-level zooms and tiles far away', () => {
    expect(tileAllowed(2, 2, 1)).toBe(false);
    const { x, y } = tilePosition(48.8566, 2.3522, 17); // Paris
    expect(tileAllowed(17, Math.floor(x), Math.floor(y))).toBe(false);
    const ny = tilePosition(40.71, -74.0, 10); // New York
    expect(tileAllowed(10, Math.floor(ny.x), Math.floor(ny.y))).toBe(false);
  });
});

describe('lookupAddress', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

  it('tells a found address from a missing one and from a silent service', async () => {
    vi.stubGlobal(
      'fetch',
      reply([{ lat: '55.74', lon: '52.39', display_name: 'Мира, 49, Набережные Челны' }]),
    );
    const found = await lookupAddress('Челны, Мира 49');
    expect(found.status).toBe('found');

    vi.stubGlobal('fetch', reply([]));
    expect(await lookupAddress('Нет такой улицы 999')).toEqual({ status: 'not_found' });

    vi.stubGlobal('fetch', reply(null, false));
    expect(await lookupAddress('Челны, Мира 49')).toEqual({ status: 'unavailable' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );
    expect(await lookupAddress('Челны, Мира 49')).toEqual({ status: 'unavailable' });
  });
});

describe('parsePhoton', () => {
  it('takes the first Russian hit and labels a house by its street', () => {
    const place = parsePhoton([
      { geometry: { coordinates: [13.4, 52.5] }, properties: { countrycode: 'DE', name: 'Mira' } },
      {
        geometry: { coordinates: [52.4081, 55.7414] },
        properties: {
          countrycode: 'RU',
          type: 'house',
          name: 'Магазин',
          street: 'проспект Мира',
          housenumber: '10',
          city: 'Набережные Челны',
        },
      },
    ]);
    expect(place).toEqual({
      lat: 55.7414,
      lon: 52.4081,
      label: 'проспект Мира, 10, Набережные Челны',
      city: 'Набережные Челны',
    });
    expect(parsePhoton([])).toBeNull();
  });
});

describe('findAddress', () => {
  const nominatim = (hits: unknown) =>
    new Response(JSON.stringify(hits), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  afterEach(() => vi.unstubAllGlobals());

  it('searches the whole of Russia without a bias and adds no default town', async () => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).searchParams);
      return nominatim([
        {
          lat: '44.99',
          lon: '41.12',
          display_name: 'x',
          address: { road: 'проезд Мира', house_number: '10', city: 'Армавир' },
        },
      ]);
    });
    const result = await findAddress('пр-т Мира, 10');
    expect(result).toMatchObject({ status: 'found', place: { city: 'Армавир' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.get('q')).toBe('проспект Мира, 10');
    expect(calls[0]?.get('countrycodes')).toBe('ru');
    expect(calls[0]?.get('viewbox')).toBeNull();
  });

  it('with a bias, tries the town around it first and keeps a hit near it', async () => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const params = new URL(url).searchParams;
      calls.push(params);
      const q = params.get('q') ?? '';
      if (q.includes('Екатеринбург')) {
        return nominatim([
          {
            lat: '56.84',
            lon: '60.6',
            display_name: 'x',
            address: { road: 'проспект Мира', house_number: '10', city: 'Екатеринбург' },
          },
        ]);
      }
      return nominatim([]);
    });
    const result = await findAddress('пр-т Мира, 10', { near: { lat: 56.85, lon: 60.6 } });
    expect(result).toMatchObject({ status: 'found', place: { city: 'Екатеринбург' } });
    expect(calls[0]?.get('q')).toBe('проспект Мира, 10, Екатеринбург');
    expect(calls[0]?.get('viewbox')).toBe('60.10,57.15,61.10,56.55');
    expect(calls[0]?.get('bounded')).toBe('0');
  });

  it('with a bias, passes over a namesake far away but keeps it as the last resort', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      queries.push(q);
      // Only Armavir has the street; the user is in Perm.
      return nominatim([{ lat: '44.99', lon: '41.12', display_name: 'Армавир' }]);
    });
    const result = await findAddress('Мира 10', { near: { lat: 58.0, lon: 56.25 } });
    expect(queries).toEqual(['Мира 10, Пермь', 'Мира 10']);
    expect(result).toMatchObject({ status: 'found', place: { lat: 44.99 } });
  });

  it('reverse-geocodes the town of a bias point far from known cities', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.includes('/reverse')) {
        return nominatim({ address: { village: 'Байкит', country_code: 'ru' } });
      }
      return nominatim([{ lat: '61.67', lon: '96.37', display_name: 'Байкит' }]);
    });
    // Krasnoyarsk krai, far from every city of the list.
    const result = await findAddress('ул. Ленина 5', { near: { lat: 61.6, lon: 96.35 } });
    expect(result.status).toBe('found');
    expect(urls[0]).toContain('/reverse?');
    expect(new URL(urls[1] ?? '').searchParams.get('q')).toBe('улица Ленина 5, Байкит');
  });

  it('does not add the bias town to an address that names its own', async () => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      queries.push(new URL(url).searchParams.get('q') ?? '');
      return nominatim([{ lat: '55.79', lon: '49.12', display_name: 'Казань' }]);
    });
    await findAddress('Казань, ул. Баумана 1', { near: { lat: 58.0, lon: 56.25 } });
    expect(queries).toEqual(['Казань, ул. Баумана 1']);
  });

  it('falls back to Photon when Nominatim throttles', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('nominatim')) return new Response('', { status: 429 });
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [52.36, 55.69] },
              properties: {
                countrycode: 'RU',
                type: 'street',
                name: 'улица Низаметдинова',
                city: 'Набережные Челны',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const result = await findAddress('Низаметдинова 7');
    expect(result).toMatchObject({
      status: 'found',
      place: { label: 'улица Низаметдинова, Набережные Челны' },
    });
  });
});

describe('parseNear', () => {
  it('reads «lat,lon» or {lat, lon} inside Russia, rounded to about 5 km', () => {
    expect(parseNear('55.7431,52.3981')).toEqual({ lat: 55.75, lon: 52.4 });
    expect(parseNear({ lat: 56.8389, lon: 60.6057 })).toEqual({ lat: 56.85, lon: 60.6 });
  });

  it('ignores anything else', () => {
    expect(parseNear(null)).toBeNull();
    expect(parseNear('')).toBeNull();
    expect(parseNear('55.7')).toBeNull();
    expect(parseNear('abc,def')).toBeNull();
    expect(parseNear({ lat: '55', lon: '52' })).toBeNull();
    expect(parseNear('48.85,2.35')).toBeNull(); // Paris
  });
});

describe('inServiceArea', () => {
  it('is Russia, from Kaliningrad to Chukotka', () => {
    expect(inServiceArea(55.74, 52.4)).toBe(true);
    expect(inServiceArea(55.75, 37.62)).toBe(true);
    expect(inServiceArea(54.71, 20.45)).toBe(true);
    expect(inServiceArea(43.12, 131.89)).toBe(true);
    expect(inServiceArea(66.0, -170.0)).toBe(true);
    expect(inServiceArea(48.85, 2.35)).toBe(false);
    expect(inServiceArea(0, 0)).toBe(false);
  });
});

describe('geocodeAddress (a place to store)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (lat: string, lon: string) => {
    const queries: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      queries.push(new URL(url).searchParams.get('q') ?? '');
      return new Response(JSON.stringify([{ lat, lon, display_name: 'x' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    return queries;
  };

  it('does not guess a town for a bare street without a bias', async () => {
    const queries = stub('44.99', '41.12');
    expect(await geocodeAddress('ул. Мира 10')).toBeNull();
    expect(queries).toEqual([]);
  });

  it('places an address that names its town anywhere in Russia', async () => {
    const queries = stub('56.84', '60.6');
    expect(await geocodeAddress('Екатеринбург, ул. Мира 10')).toMatchObject({ lat: 56.84 });
    expect(queries).toEqual(['Екатеринбург, ул. Мира 10']);
  });

  it('takes a bare street only near the bias', async () => {
    stub('44.99', '41.12'); // Armavir
    expect(await geocodeAddress('ул. Мира 10', { near: { lat: 58.0, lon: 56.25 } })).toBeNull();
    stub('58.01', '56.24'); // Perm
    expect(await geocodeAddress('ул. Мира 10', { near: { lat: 58.0, lon: 56.25 } })).toMatchObject({
      lat: 58.01,
    });
    // The order's own city works as a bias too.
    expect(await geocodeAddress('ул. Мира 10', { city: 'Пермь' })).toMatchObject({ lat: 58.01 });
  });
});

describe('viewboxAround', () => {
  it('stays within ±180° in Chukotka', () => {
    expect(viewboxAround({ lat: 65, lon: 179.8 })).toBe('179.30,65.30,180.00,64.70');
    expect(viewboxAround({ lat: 55.75, lon: 52.4 })).toBe('51.90,56.05,52.90,55.45');
  });
});
