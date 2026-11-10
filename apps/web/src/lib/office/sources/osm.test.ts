import { describe, expect, it, vi } from 'vitest';
import {
  OVERPASS_MIRRORS,
  OVERPASS_RELAY_MIRRORS,
  OVERPASS_TOTAL_MS,
  OVERPASS_URL,
  buildOverpassQuery,
  createOsmSource,
  parseOverpass,
  parseOverpassNeighbors,
  withoutWebsite,
} from './osm';
import { candidateEmail, candidatePhone, candidateTelegram } from './phone';
import type { SourceCity, SourceNiche } from './types';

const kazan: SourceCity = { name: 'Казань', lat: 55.7963, lon: 49.1088 };

const dentist: SourceNiche = {
  key: 'dentist',
  osm: [
    ['amenity', 'dentist'],
    ['healthcare', 'dentist'],
  ],
};

const machineryRegex = /спецтехник|экскават|автокран|манипулятор|самосвал|погрузчик/i;
const machinery: SourceNiche = {
  key: 'machinery',
  osm: [
    ['shop', 'rental'],
    ['office', 'company'],
  ],
  nameRegex: machineryRegex,
  machineryTags: (name) => {
    const tags: string[] = [];
    if (/экскават/i.test(name)) tags.push('excavator');
    if (/автокран/i.test(name)) tags.push('crane');
    return tags;
  },
};

const fixture = {
  elements: [
    // без телефона — мимо
    { type: 'node', id: 1, lat: 55.8, lon: 49.1, tags: { name: 'Стоматология «Улыбка»' } },
    // с сайтом — остаётся в разборе, но убирается withoutWebsite
    {
      type: 'node',
      id: 2,
      lat: 55.81,
      lon: 49.11,
      tags: {
        name: 'Стоматологии «Дента»',
        phone: '+7 843 200-10-10',
        website: 'https://denta.example',
      },
    },
    // contact:phone в городском формате + адрес
    {
      type: 'node',
      id: 3,
      lat: 55.82,
      lon: 49.12,
      tags: {
        name: 'Стоматологию доктора Петрова',
        'contact:phone': '8 (843) 123-45-67',
        'addr:street': 'улица Баумана',
        'addr:housenumber': '10',
        'addr:city': 'Казань',
        opening_hours: 'Mo-Fr 09:00-20:00',
        'contact:email': 'Petrov@Dent.Example; info@dent.example',
        'contact:whatsapp': '8 917 111-22-33',
        'contact:telegram': 'https://t.me/dr_petrov',
      },
    },
    // way с center, два номера через «;»
    {
      type: 'way',
      id: 4,
      center: { lat: 55.83, lon: 49.13 },
      tags: {
        name: 'Стоматологией «Жемчуг»',
        phone: '+7 (843) 555-00-01; +7 917 000-00-02',
        'addr:street': 'проспект Победы',
        'addr:housenumber': '5',
        email: 'не почта',
        'contact:telegram': '@zhemchug_dent',
      },
    },
    // дубль по телефону (тот же первый номер) — мимо
    {
      type: 'node',
      id: 5,
      lat: 55.84,
      lon: 49.14,
      tags: { name: 'Стоматология «Жемчуг-2»', 'contact:mobile': '8 843 555 00 01' },
    },
    // техника — по названию
    {
      type: 'node',
      id: 6,
      lat: 55.85,
      lon: 49.15,
      tags: { name: 'Аренда экскаваторов и автокранов «СтройТех»', phone: '89170001122' },
    },
  ],
};

describe('candidatePhone', () => {
  it('приводит мобильные и городские номера к +7', () => {
    expect(candidatePhone('8 (917) 000-00-00')).toBe('+79170000000');
    expect(candidatePhone('8 (843) 123-45-67')).toBe('+78431234567');
    expect(candidatePhone('+7 843 123 45 67')).toBe('+78431234567');
    expect(candidatePhone('9170000000')).toBe('+79170000000');
    expect(candidatePhone('+7 (843) 555-00-01; +7 917 000-00-02')).toBe('+78435550001');
    expect(candidatePhone('нет номера, +7 917 000-00-02')).toBe('+79170000002');
    expect(candidatePhone('12345')).toBeNull();
    expect(candidatePhone(undefined)).toBeNull();
  });
});

describe('candidateEmail / candidateTelegram', () => {
  it('e-mail — первый валидный, в нижнем регистре', () => {
    expect(candidateEmail('Info@Example.RU')).toBe('info@example.ru');
    expect(candidateEmail('mailto:a@b.co; c@d.ru')).toBe('a@b.co');
    expect(candidateEmail('нет; c@d.ru')).toBe('c@d.ru');
    expect(candidateEmail('просто текст')).toBeNull();
    expect(candidateEmail(null)).toBeNull();
  });

  it('telegram — имя без @ или из ссылки', () => {
    expect(candidateTelegram('@stroytech')).toBe('stroytech');
    expect(candidateTelegram('stroytech_16')).toBe('stroytech_16');
    expect(candidateTelegram('https://t.me/stroytech16?start=1')).toBe('stroytech16');
    expect(candidateTelegram('t.me/s/stroytech16')).toBe('stroytech16');
    expect(candidateTelegram('+7 917 000-00-00')).toBeNull();
    expect(candidateTelegram('')).toBeNull();
  });
});

describe('buildOverpassQuery', () => {
  it('содержит around и все пары тегов', () => {
    const q = buildOverpassQuery(dentist, kazan, 15);
    expect(q.startsWith('[out:json][timeout:25];(')).toBe(true);
    expect(q).toContain('nwr["amenity"="dentist"](around:15000,55.7963,49.1088);');
    expect(q).toContain('nwr["healthcare"="dentist"](around:15000,55.7963,49.1088);');
    expect(q.endsWith(');out center tags;')).toBe(true);
  });

  it('в запросе только теги: фильтр по названию зеркала Overpass не успевают выполнить', () => {
    const machinery = {
      key: 'machinery',
      osm: [['office', 'company'] as [string, string], ['craft', '*'] as [string, string]],
      nameRegex: /экскават|автокран/i,
    };
    const q = buildOverpassQuery(machinery, kazan, 15);
    expect(q).toContain('nwr["office"="company"](around:15000,');
    expect(q).toContain('nwr["craft"](around:15000,');
    expect(q).not.toContain('"name"');
  });
});

describe('parseOverpass', () => {
  it('оставляет объекты с названием и телефоном, склеивает адрес, берёт center у way', () => {
    const list = parseOverpass(fixture, dentist);
    expect(list.map((c) => c.sourceRef)).toEqual([
      'osm:node/2',
      'osm:node/3',
      'osm:way/4',
      'osm:node/6',
    ]);
    const petrov = list[1]!;
    expect(petrov.phone).toBe('+78431234567');
    expect(petrov.address).toBe('улица Баумана, 10, Казань');
    expect(petrov.hours).toBe('Mo-Fr 09:00-20:00');
    expect(petrov.website).toBeNull();
    expect(petrov.lat).toBe(55.82);
    expect(petrov.email).toBe('petrov@dent.example');
    expect(petrov.whatsapp).toBe('+79171112233');
    expect(petrov.telegram).toBe('dr_petrov');

    const zhemchug = list[2]!;
    expect(zhemchug.phone).toBe('+78435550001');
    expect(zhemchug.lat).toBe(55.83);
    expect(zhemchug.lon).toBe(49.13);
    expect(zhemchug.address).toBe('проспект Победы, 5');
    expect(zhemchug.email).toBeNull();
    // WhatsApp не подставляется из обычного телефона
    expect(zhemchug.whatsapp).toBeNull();
    expect(zhemchug.telegram).toBe('zhemchug_dent');

    expect(list[0]!.website).toBe('https://denta.example');
    expect(list.every((c) => c.tags.length === 0)).toBe(true);
  });

  it('для техники фильтрует по названию и ставит виды техники', () => {
    const list = parseOverpass(fixture, machinery);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Аренда экскаваторов и автокранов «СтройТех»');
    expect(list[0]!.phone).toBe('+79170001122');
    expect(list[0]!.tags).toEqual(['excavator', 'crane']);
  });

  it('не падает на мусоре', () => {
    expect(parseOverpass(null, dentist)).toEqual([]);
    expect(parseOverpass({ elements: [null, 1, { tags: null }] }, dentist)).toEqual([]);
  });
});

describe('parseOverpassNeighbors', () => {
  const json = {
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 55.79,
        lon: 49.1,
        tags: { name: 'С телефоном', phone: '+7 843 200-00-01' },
      },
      {
        type: 'node',
        id: 2,
        lat: 55.79,
        lon: 49.1,
        tags: { name: 'Без телефона', website: 'https://a.example' },
      },
      { type: 'way', id: 3, center: { lat: 55.8, lon: 49.11 }, tags: { name: 'Здание' } },
      { type: 'node', id: 4, lat: 55.79, lon: 49.1, tags: { amenity: 'dentist' } },
      { type: 'node', id: 5, tags: { name: 'Без координат' } },
      { type: 'node', id: 1, lat: 55.79, lon: 49.1, tags: { name: 'Повтор' } },
    ],
  };

  it('все названные объекты с координатами — и без телефона; без названия и дубли мимо', () => {
    expect(parseOverpassNeighbors(json, dentist)).toEqual([
      { ref: 'osm:node/1', lat: 55.79, lon: 49.1, hasSite: false },
      { ref: 'osm:node/2', lat: 55.79, lon: 49.1, hasSite: true },
      { ref: 'osm:way/3', lat: 55.8, lon: 49.11, hasSite: false },
    ]);
    // Кандидат — только объект с телефоном.
    expect(parseOverpass(json, dentist).map((c) => c.sourceRef)).toEqual(['osm:node/1']);
  });

  it('для ниши с фильтром по названию — только совпавшие; мусор не роняет', () => {
    expect(parseOverpassNeighbors(json, machinery)).toEqual([]);
    expect(parseOverpassNeighbors(null, dentist)).toEqual([]);
    expect(parseOverpassNeighbors({ elements: [null, 5, {}] }, dentist)).toEqual([]);
  });

  it('зеркала для раннера: только те, что ответили на пробе', () => {
    expect(OVERPASS_RELAY_MIRRORS).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]);
  });
});

describe('withoutWebsite', () => {
  it('убирает кандидатов с сайтом, пустая строка — тоже «нет сайта»', () => {
    const list = parseOverpass(fixture, dentist).map((c, i) =>
      i === 1 ? { ...c, website: '' } : c,
    );
    expect(withoutWebsite(list).map((c) => c.sourceRef)).toEqual([
      'osm:node/3',
      'osm:way/4',
      'osm:node/6',
    ]);
  });
});

describe('osmSource.search', () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('делает POST на Overpass и возвращает всех, и с сайтом (они нужны досье)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixture));
    const source = createOsmSource(fetchMock);
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.map((c) => c.sourceRef)).toEqual([
      'osm:node/2',
      'osm:node/3',
      'osm:way/4',
      'osm:node/6',
    ]);
    expect(result.candidates[0]!.website).toBe('https://denta.example');
    // Соседи — все названные объекты ответа, их не меньше, чем кандидатов.
    expect(result.neighbors!.length).toBeGreaterThanOrEqual(result.candidates.length);
    expect(result.neighbors!.map((n) => n.ref)).toContain('osm:node/2');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OVERPASS_URL);
    expect(init.method).toBe('POST');
    expect(String(init.body)).toMatch(/^data=/);
    expect(decodeURIComponent(String(init.body).slice(5))).toContain('around:15000');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers['User-Agent']).toContain('SpecPlast16');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('limit считает только фирмы без сайта, фирмы с сайтом остаются соседями', async () => {
    const source = createOsmSource(async () => jsonResponse(fixture));
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 2 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.map((c) => c.sourceRef)).toEqual([
      'osm:node/2',
      'osm:node/3',
      'osm:way/4',
    ]);
  });

  it('фирмы с сайтом в начале ответа не съедают лимит кандидатов', async () => {
    const withSite = Array.from({ length: 5 }, (_, i) => ({
      type: 'node',
      id: 100 + i,
      lat: 55.8,
      lon: 49.1,
      tags: {
        name: `Стоматология ${i}`,
        phone: `+7 843 200-20-${10 + i}`,
        website: `https://s${i}.example`,
      },
    }));
    const source = createOsmSource(async () =>
      jsonResponse({ elements: [...withSite, ...fixture.elements] }),
    );
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 3 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates.filter((c) => c.website)).toHaveLength(6);
    expect(result.candidates.filter((c) => !c.website).map((c) => c.sourceRef)).toEqual([
      'osm:node/3',
      'osm:way/4',
      'osm:node/6',
    ]);
  });

  it('HTTP 504 на всех зеркалах → unavailable, каждое зеркало спрошено один раз', async () => {
    const fetchMock = vi.fn(async () => new Response('Gateway Timeout', { status: 504 }));
    const source = createOsmSource(fetchMock);
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(result).toEqual({ status: 'unavailable', error: 'Источник карт не ответил' });
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      ...OVERPASS_MIRRORS,
    ]);
  });

  it('основное зеркало сбросило соединение — ответ приходит со следующего', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === OVERPASS_URL) throw new Error('ECONNRESET');
      return jsonResponse(fixture);
    });
    const source = createOsmSource(fetchMock);
    const result = await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe(OVERPASS_MIRRORS[1]);
  });

  it('ошибка самого запроса (400) не лечится другим зеркалом', async () => {
    const fetchMock = vi.fn(async () => new Response('Bad Request', { status: 400 }));
    const source = createOsmSource(fetchMock);
    await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('когда общее время вышло, следующее зеркало не спрашивается', async () => {
    let now = 0;
    const fetchMock = vi.fn(async () => {
      now += OVERPASS_TOTAL_MS;
      throw new Error('timeout');
    });
    const source = createOsmSource(fetchMock, OVERPASS_MIRRORS, () => now);
    await source.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('исключение сети и плохой JSON → unavailable', async () => {
    const failing = createOsmSource(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await failing.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 })).toEqual({
      status: 'unavailable',
      error: 'Источник карт не ответил',
    });
    const badJson = createOsmSource(async () => new Response('<html>', { status: 200 }));
    expect(await badJson.search({ niche: dentist, city: kazan, radiusKm: 15, limit: 10 })).toEqual({
      status: 'unavailable',
      error: 'Источник карт не ответил',
    });
  });
});
