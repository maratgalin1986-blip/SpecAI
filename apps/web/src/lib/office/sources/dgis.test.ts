import { describe, expect, it, vi } from 'vitest';
import {
  DGIS_MAX_PAGES,
  DGIS_PAGE_SIZE,
  createDgisSource,
  dgisHours,
  dgisUrl,
  parseDgis,
} from './dgis';
import { firstAvailable, withFallback } from './fallback';
import type { ProspectSource, SourceCity, SourceNiche } from './types';

const kazan: SourceCity = { name: 'Казань', lat: 55.7963, lon: 49.1088 };
const dentist: SourceNiche = { key: 'dentist', osm: [], dgisQuery: 'стоматология' };

const item = (
  id: string,
  name: string,
  contacts: { type: string; value: string }[],
  extra = {},
) => ({
  id,
  name,
  address_name: 'Баумана, 10',
  point: { lat: 55.79, lon: 49.11 },
  contact_groups: [{ contacts }],
  ...extra,
});

const fixture = {
  result: {
    total: 5,
    items: [
      item('1', 'Стоматология «Улыбка»', [
        { type: 'phone', value: '+7 (843) 212-34-56' },
        { type: 'email', value: 'Info@Ulybka.example' },
        { type: 'whatsapp', value: '79170001122' },
      ]),
      item('2', 'Дента с сайтом', [
        { type: 'phone', value: '88432000002' },
        { type: 'website', value: 'https://denta.example' },
      ]),
      item('3', 'Без телефона', [{ type: 'email', value: 'x@y.example' }]),
      item('4', 'Тот же телефон', [{ type: 'phone', value: '+78432123456' }]),
      item('5', 'Клиника с расписанием', [{ type: 'phone', value: '+78432000005' }], {
        schedule: {
          Mon: { working_hours: [{ from: '09:00', to: '20:00' }] },
          Tue: { working_hours: [{ from: '09:00', to: '20:00' }] },
          Wed: { working_hours: [{ from: '09:00', to: '20:00' }] },
          Thu: { working_hours: [{ from: '09:00', to: '20:00' }] },
          Fri: { working_hours: [{ from: '09:00', to: '20:00' }] },
        },
      }),
    ],
  },
};

const ON = { DGIS_API_KEY: 'KEY', DGIS_STORAGE_ALLOWED: '1' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseDgis', () => {
  it('берёт карточки с названием и телефоном, контакты по типам, без дублей по номеру', () => {
    const list = parseDgis(fixture);
    expect(list.map((c) => c.sourceRef)).toEqual(['2gis:1', '2gis:2', '2gis:5']);
    expect(list[0]).toMatchObject({
      name: 'Стоматология «Улыбка»',
      phone: '+78432123456',
      email: 'info@ulybka.example',
      whatsapp: '+79170001122',
      address: 'Баумана, 10',
      lat: 55.79,
      website: null,
    });
    expect(list[1]!.website).toBe('https://denta.example');
    expect(list[2]!.hours).toBe('Пн–Пт 09:00–20:00');
  });

  it('не падает на мусоре', () => {
    expect(parseDgis(null)).toEqual([]);
    expect(parseDgis({ result: { items: [{}, { name: 1 }, null] } })).toEqual([]);
    expect(dgisHours({ Mon: { working_hours: [{ from: '09:00', to: '18:00' }] } })).toBeNull();
  });
});

describe('createDgisSource', () => {
  it('без ключа источника нет', () => {
    expect(createDgisSource({})).toBeNull();
    expect(createDgisSource({ DGIS_API_KEY: '', DGIS_STORAGE_ALLOWED: '1' })).toBeNull();
  });

  it('ключ без разрешения на хранение — источника нет', () => {
    expect(createDgisSource({ DGIS_API_KEY: 'KEY' })).toBeNull();
    expect(createDgisSource({ DGIS_API_KEY: 'KEY', DGIS_STORAGE_ALLOWED: 'true' })).toBeNull();
    expect(createDgisSource({ DGIS_API_KEY: 'KEY', DGIS_STORAGE_ALLOWED: '0' })).toBeNull();
    expect(createDgisSource(ON)).not.toBeNull();
  });

  it('meta.code 403 при HTTP 200 — unavailable с кодом; 404 — пустой ответ', async () => {
    const denied = createDgisSource(ON, async () =>
      json({ meta: { code: 403, error: { message: 'Authorization error' } } }),
    )!;
    const input = { niche: dentist, city: kazan, radiusKm: 15, limit: 10 };
    expect(await denied.search(input)).toEqual({ status: 'unavailable', error: '2ГИС: код 403' });
    const nothing = createDgisSource(ON, async () => json({ meta: { code: 404 } }))!;
    expect(await nothing.search(input)).toEqual({ status: 'ok', candidates: [] });
  });

  it('карточки без contact_groups — у ключа нет доступа к контактам', async () => {
    const items = [1, 2, 3].map((i) => ({ id: `n${i}`, name: `Фирма ${i}`, address_name: 'А, 1' }));
    const source = createDgisSource(ON, async () =>
      json({ meta: { code: 200 }, result: { items } }),
    )!;
    expect(await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 })).toEqual({
      status: 'unavailable',
      error: '2ГИС: у ключа нет доступа к контактам',
    });
  });

  it('полная страница, где телефон лишь у трёх, всё равно ведёт на вторую', async () => {
    const full = Array.from({ length: DGIS_PAGE_SIZE }, (_, i) =>
      item(`r${i}`, `Фирма ${i}`, i < 3 ? [{ type: 'phone', value: `+784320000${10 + i}` }] : []),
    );
    const fetchMock = vi.fn(async (url: string) =>
      json({ meta: { code: 200 }, result: { items: url.includes('page=1&') ? full : [] } }),
    );
    const source = createDgisSource(ON, fetchMock)!;
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain('page=2&');
    expect(result.status === 'ok' && result.candidates).toHaveLength(3);
  });

  it('размер страницы можно уменьшить, но не увеличить; в запросе type=branch', async () => {
    const fetchMock = vi.fn(async (_url: string) => json(fixture));
    await createDgisSource(ON, fetchMock, Date.now, 10)!.search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(fetchMock.mock.calls[0]![0]).toContain('page_size=10&');
    expect(fetchMock.mock.calls[0]![0]).toContain('type=branch');
    expect(dgisUrl('KEY', 'x', kazan, 15, 1)).toContain(`page_size=${DGIS_PAGE_SIZE}&`);
    // Больше 50 не просим: аргумент только уменьшает размер.
    const more = vi.fn(async (_url: string) => json(fixture));
    await createDgisSource(ON, more, Date.now, 500)!.search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(more.mock.calls[0]![0]).toContain(`page_size=${DGIS_PAGE_SIZE}&`);
  });

  it('спрашивает 2ГИС с ключом, фразой ниши и точкой города; отдаёт всех, и с сайтом', async () => {
    const fetchMock = vi.fn(async () => json(fixture));
    const source = createDgisSource(ON, fetchMock)!;
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.map((c) => c.sourceRef)).toEqual(['2gis:1', '2gis:2', '2gis:5']);
    expect(result.candidates[1]!.website).toBe('https://denta.example');
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe(dgisUrl('KEY', 'стоматология', kazan, 15, 1));
    expect(url).toContain(
      'q=%D1%81%D1%82%D0%BE%D0%BC%D0%B0%D1%82%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F',
    );
    expect(url).toContain('point=49.1088%2C55.7963');
    expect(url).toContain('radius=15000');
    expect(url).toContain('key=KEY');
    // Страница неполная — вторую не просим.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('листает страницы, пока они полные и кандидатов меньше лимита', async () => {
    const full = {
      result: {
        items: Array.from({ length: DGIS_PAGE_SIZE }, (_, i) =>
          item(`p${i}`, `Фирма ${i}`, [
            { type: 'phone', value: `+7843${String(1000000 + i).slice(-7)}` },
          ]),
        ),
      },
    };
    const fetchMock = vi.fn(async () => json(full));
    const source = createDgisSource(ON, fetchMock)!;
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(DGIS_MAX_PAGES);
    expect(result.status === 'ok' && result.candidates.length).toBe(
      DGIS_PAGE_SIZE * DGIS_MAX_PAGES,
    );
  });

  it('limit считает только фирмы без сайта: страницы фирм с сайтом листаются дальше', async () => {
    let page = 0;
    const fetchMock = vi.fn(async () => {
      page++;
      const items = Array.from({ length: DGIS_PAGE_SIZE }, (_, i) =>
        item(`p${page}-${i}`, `Фирма ${page}-${i}`, [
          { type: 'phone', value: `+7843${String(1000000 + page * 100 + i).slice(-7)}` },
          ...(page === 1 ? [{ type: 'website', value: `https://f${i}.example` }] : []),
        ]),
      );
      return json({ result: { items } });
    });
    const source = createDgisSource(ON, fetchMock)!;
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.filter((c) => c.website)).toHaveLength(DGIS_PAGE_SIZE);
    expect(result.candidates.filter((c) => !c.website)).toHaveLength(3);
  });

  it('ниша без фразы — пустой ответ без запроса; ошибка сети — unavailable', async () => {
    const fetchMock = vi.fn(async () => json(fixture));
    const source = createDgisSource(ON, fetchMock)!;
    const empty = await source.search({
      niche: { key: 'x', osm: [] },
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(empty).toEqual({ status: 'ok', candidates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    const failing = createDgisSource(ON, async () => {
      throw new Error('ECONNRESET');
    })!;
    expect(await failing.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 })).toEqual({
      status: 'unavailable',
      error: '2ГИС не ответил',
    });
  });

  it('для техники фильтрует по названию и ставит виды техники', async () => {
    const machinery: SourceNiche = {
      key: 'machinery',
      osm: [],
      dgisQuery: 'аренда спецтехники',
      nameRegex: /экскават|автокран/i,
      machineryTags: (name) => (/экскават/i.test(name) ? ['excavators'] : []),
    };
    const body = {
      result: {
        items: [
          item('a', 'Аренда экскаваторов', [{ type: 'phone', value: '+79170000001' }]),
          item('b', 'Автомойка', [{ type: 'phone', value: '+79170000002' }]),
        ],
      },
    };
    const source = createDgisSource(ON, async () => json(body))!;
    const result = await source.search({ niche: machinery, city: kazan, radiusKm: 15, limit: 10 });
    expect(result.status === 'ok' && result.candidates.map((c) => [c.name, c.tags])).toEqual([
      ['Аренда экскаваторов', ['excavators']],
    ]);
  });
});

describe('withFallback', () => {
  const ok = (id: string, n: number): ProspectSource => ({
    id,
    search: vi.fn(async () => ({
      status: 'ok' as const,
      candidates: Array.from({ length: n }, (_, i) => ({
        name: `${id} ${i}`,
        phone: `+7917000000${i}`,
        address: null,
        lat: null,
        lon: null,
        hours: null,
        website: null,
        email: null,
        whatsapp: null,
        telegram: null,
        tags: [],
        sourceRef: `${id}:${i}`,
      })),
    })),
  });
  const down = (id: string): ProspectSource => ({
    id,
    search: vi.fn(async () => ({ status: 'unavailable' as const, error: `${id} молчит` })),
  });

  it('первый источник с кандидатами побеждает; пустой или молчащий — идём дальше', async () => {
    const a = down('2gis');
    const b = ok('osm', 2);
    const s = withFallback([a, b]);
    const r = await s.search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
      budgetMs: 30_000,
    });
    expect(r.status === 'ok' && r.candidates).toHaveLength(2);
    expect(a.search).toHaveBeenCalledTimes(1);
    expect(b.search).toHaveBeenCalledTimes(1);
    const first = ok('2gis', 3);
    const r2 = await withFallback([first, b]).search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(r2.status === 'ok' && r2.candidates[0]!.sourceRef).toBe('2gis:0');
  });

  it('все молчат — unavailable с последней ошибкой; один источник возвращается как есть', async () => {
    const r = await withFallback([down('a'), down('b')]).search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(r).toEqual({ status: 'unavailable', error: 'b молчит' });
    const only = ok('osm', 1);
    expect(withFallback([only])).toBe(only);
  });

  it('живой источник без новых фирм не превращается в ошибку из-за молчащего следующего', async () => {
    const empty = ok('2gis', 0);
    const r = await withFallback([empty, down('osm')]).search({
      niche: dentist,
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(r).toEqual({ status: 'ok', candidates: [] });
  });
});

describe('firstAvailable: один набор данных через разные сервисы', () => {
  const ok = (id: string): ProspectSource => ({
    id,
    search: vi.fn(async () => ({ status: 'ok' as const, candidates: [] })),
  });
  const down = (id: string): ProspectSource => ({
    id,
    search: vi.fn(async () => ({ status: 'unavailable' as const, error: `${id} молчит` })),
  });
  const input = { niche: dentist, city: kazan, radiusKm: 15, limit: 10 };

  it('первый ответил (даже пусто) — второй не спрашивается', async () => {
    const overpass = down('osm');
    const source = firstAvailable([ok('nominatim'), overpass]);
    expect(source.id).toBe('nominatim+osm');
    expect(await source.search(input)).toEqual({ status: 'ok', candidates: [] });
    expect(overpass.search).not.toHaveBeenCalled();
  });

  it('первый молчит — отвечает второй; молчат оба — последняя ошибка', async () => {
    expect((await firstAvailable([down('nominatim'), ok('osm')]).search(input)).status).toBe('ok');
    expect(await firstAvailable([down('a'), down('b')]).search(input)).toEqual({
      status: 'unavailable',
      error: 'b молчит',
    });
  });
});
