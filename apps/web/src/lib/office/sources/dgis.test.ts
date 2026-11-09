import { describe, expect, it, vi } from 'vitest';
import {
  DGIS_MAX_PAGES,
  DGIS_PAGE_SIZE,
  createDgisSource,
  dgisHours,
  dgisUrl,
  parseDgis,
} from './dgis';
import { withFallback } from './fallback';
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
    expect(createDgisSource('')).toBeNull();
    expect(createDgisSource(undefined)).toBeNull();
  });

  it('спрашивает 2ГИС с ключом, фразой ниши и точкой города; отдаёт всех, и с сайтом', async () => {
    const fetchMock = vi.fn(async () => json(fixture));
    const source = createDgisSource('KEY', fetchMock)!;
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
    const source = createDgisSource('KEY', fetchMock)!;
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(DGIS_MAX_PAGES);
    expect(result.status === 'ok' && result.candidates.length).toBe(
      DGIS_PAGE_SIZE * DGIS_MAX_PAGES,
    );
  });

  it('ниша без фразы — пустой ответ без запроса; ошибка сети — unavailable', async () => {
    const fetchMock = vi.fn(async () => json(fixture));
    const source = createDgisSource('KEY', fetchMock)!;
    const empty = await source.search({
      niche: { key: 'x', osm: [] },
      city: kazan,
      radiusKm: 15,
      limit: 10,
    });
    expect(empty).toEqual({ status: 'ok', candidates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    const failing = createDgisSource('KEY', async () => {
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
    const source = createDgisSource('KEY', async () => json(body))!;
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
});
