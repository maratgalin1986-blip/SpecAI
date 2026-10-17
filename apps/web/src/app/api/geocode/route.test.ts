import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const queries: URLSearchParams[] = [];
vi.stubGlobal('fetch', async (url: string) => {
  const params = new URL(url).searchParams;
  queries.push(params);
  return new Response(
    JSON.stringify([
      {
        lat: '58.01',
        lon: '56.25',
        display_name: 'x',
        address: { road: 'улица Ленина', house_number: '5', city: 'Пермь' },
      },
    ]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});

const { GET } = await import('./route');

const call = (query: string, ip: string) =>
  GET(
    new NextRequest(`https://example.test/api/geocode?${query}`, {
      headers: { 'x-real-ip': ip },
    }),
  );

describe('GET /api/geocode', () => {
  afterEach(() => {
    queries.length = 0;
  });

  it('searches the whole of Russia without a bias, with no default town', async () => {
    const response = await call(`q=${encodeURIComponent('ул. Ленина 5')}`, '10.0.0.1');
    expect(response.status).toBe(200);
    expect(queries[0]?.get('q')).toBe('улица Ленина 5');
    expect(queries[0]?.get('viewbox')).toBeNull();
  });

  it('looks for a bare street in the town around `near`, rounded', async () => {
    const response = await call(
      `q=${encodeURIComponent('ул. Ленина 5')}&near=58.0105,56.2502`,
      '10.0.0.2',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ place: { city: 'Пермь' } });
    expect(queries[0]?.get('q')).toBe('улица Ленина 5, Пермь');
    // 58.0105, 56.2502 → 58.00, 56.25 (about 5 km): the house is not sent on.
    expect(queries[0]?.get('viewbox')).toBe('55.75,58.30,56.75,57.70');
  });

  it('ignores a broken or foreign `near`', async () => {
    await call(`q=${encodeURIComponent('ул. Ленина 5')}&near=48.85,2.35`, '10.0.0.3');
    expect(queries[0]?.get('q')).toBe('улица Ленина 5');
    expect(queries[0]?.get('viewbox')).toBeNull();
  });
});
