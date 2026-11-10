import { describe, expect, it, vi } from 'vitest';
import {
  NOMINATIM_MAX_REQUESTS,
  NOMINATIM_PAGE,
  createNominatimSource,
  nominatimQueries,
  toOverpassElements,
  viewbox,
} from './nominatim';
import type { SourceNiche } from './types';

const tyres: SourceNiche = { key: 'tyres', osm: [['shop', 'tyres']] };
const kazan = { name: 'Казань', lat: 55.796, lon: 49.108 };

const row = (id: number, over: Record<string, unknown> = {}) => ({
  place_id: 1000 + id,
  osm_type: 'node',
  osm_id: id,
  lat: '55.8',
  lon: '49.1',
  name: `Шины ${id}`,
  extratags: { phone: `+7 843 200-00-${String(id).padStart(2, '0')}` },
  address: { road: 'улица Декабристов', house_number: '1', city: 'Казань' },
  ...over,
});

const noSleep = async () => {};

describe('источник Nominatim', () => {
  it('рамка города: запад, север, восток, юг', () => {
    const [w, n, e, s] = viewbox(kazan, 15).split(',').map(Number);
    expect(w).toBeLessThan(kazan.lon);
    expect(e).toBeGreaterThan(kazan.lon);
    expect(n).toBeGreaterThan(kazan.lat);
    expect(s).toBeLessThan(kazan.lat);
  });

  it('запросы: «[ключ=значение]» по тегам; ниша с фильтром по названию — слова, без «*»', () => {
    expect(nominatimQueries(tyres)).toEqual(['[shop=tyres]']);
    const machinery: SourceNiche = {
      key: 'machinery',
      osm: [
        ['office', 'company'],
        ['industrial', '*'],
      ],
      nameRegex: /кран/i,
      dgisQuery: 'аренда спецтехники',
    };
    expect(nominatimQueries(machinery)).toEqual([
      'аренда спецтехники',
      'спецтехника',
      'автокран',
      'экскаватор',
    ]);
    expect(nominatimQueries({ key: 'x', osm: [['craft', '*']] })).toEqual([]);
  });

  it('ответ превращается в теги OSM: имя, адрес, extratags', () => {
    const { elements } = toOverpassElements([row(7), { name: 'без id' }, null]);
    expect(elements).toEqual([
      {
        type: 'node',
        id: 7,
        lat: 55.8,
        lon: 49.1,
        tags: {
          phone: '+7 843 200-00-07',
          name: 'Шины 7',
          'addr:street': 'улица Декабристов',
          'addr:housenumber': '1',
          'addr:city': 'Казань',
        },
      },
    ]);
  });

  it('кандидаты с телефоном; фирмы с сайтом остаются соседями; свой User-Agent', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json([
        row(1),
        row(2, { extratags: { phone: '+7 843 200-00-02', 'contact:website': 'https://x.ru' } }),
        row(3, { extratags: {} }),
      ]),
    );
    const result = await createNominatimSource(fetchImpl, noSleep).search({
      niche: tyres,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.map((c) => [c.name, c.website, c.sourceRef])).toEqual([
      ['Шины 1', null, 'osm:node/1'],
      ['Шины 2', 'https://x.ru', 'osm:node/2'],
    ]);
    expect(result.candidates[0]!.address).toBe('улица Декабристов, 1, Казань');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('bounded=1');
    expect(decodeURIComponent(url)).toContain('q=[shop=tyres]');
    expect((init!.headers as Record<string, string>)['User-Agent']).toMatch(/SpecPlast16/);
  });

  it('полная страница — вторая с exclude_place_ids и паузой; запросов не больше лимита', async () => {
    const full = Array.from({ length: NOMINATIM_PAGE }, (_, i) => row(i + 1));
    const fetchImpl = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json(full))
      .mockResolvedValue(Response.json([row(99)]));
    const sleep = vi.fn(noSleep);
    const result = await createNominatimSource(fetchImpl, sleep).search({
      niche: tyres,
      city: kazan,
      radiusKm: 15,
      limit: 200,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]![0]).toContain('exclude_place_ids=1001');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(result.status === 'ok' && result.candidates.length).toBe(NOMINATIM_PAGE + 1);
    expect(NOMINATIM_MAX_REQUESTS).toBeLessThanOrEqual(6);
  });

  it('разовый сбой — одна повторная попытка', async () => {
    const fetchImpl = vi
      .fn<(url: string) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('сеть'))
      .mockResolvedValue(Response.json([row(1)]));
    const result = await createNominatimSource(fetchImpl, noSleep).search({
      niche: tyres,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status === 'ok' && result.candidates.length).toBe(1);
  });

  it('сервис не ответил — unavailable; нет времени — запросов нет', async () => {
    const down = vi.fn(async () => new Response('нет', { status: 503 }));
    const source = createNominatimSource(down, noSleep);
    const input = { niche: tyres, city: kazan, radiusKm: 15, limit: 10 };
    expect((await source.search(input)).status).toBe('unavailable');
    down.mockClear();
    expect((await source.search({ ...input, budgetMs: 1_000 })).status).toBe('unavailable');
    expect(down).not.toHaveBeenCalled();
  });
});
