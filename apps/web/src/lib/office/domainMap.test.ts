import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_DOMAIN_HEADER,
  DOMAIN_MAP_PATH,
  DOMAIN_MAP_RETRY_MS,
  DOMAIN_MAP_TTL_MS,
  DOMAIN_MAP_WHERE,
  clientSiteFor,
  clientSitePath,
  domainMapEntries,
  domainMapFetcher,
  getDomainMap,
  parseDomainMap,
  resetDomainMapCache,
} from './domainMap';
import { SLUG_RE } from './visibility';

const NOW = Date.parse('2026-11-09T10:00:00Z');

function mapJson(...entries: [string, string][]) {
  return { sites: entries.map(([host, slug]) => ({ host, slug })) };
}

describe('domainMapEntries: ответ GET /api/office/domains', () => {
  it('оба хоста сайта, только host и slug — без имён, телефонов и id', () => {
    const rows = [
      {
        id: 'p1',
        name: 'Стоматология «Улыбка»',
        phone: '+7 900 000-00-00',
        email: 'ulybka@example.ru',
        slug: 'ulybka-kazan',
        domain: 'ulybka-kazan.ru',
      },
    ];
    const entries = domainMapEntries(rows);
    expect(entries).toEqual([
      { host: 'ulybka-kazan.ru', slug: 'ulybka-kazan' },
      { host: 'www.ulybka-kazan.ru', slug: 'ulybka-kazan' },
    ]);
    for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(['host', 'slug']);
    const text = JSON.stringify(entries);
    expect(text).not.toContain('p1');
    expect(text).not.toContain('Улыбка');
    expect(text).not.toContain('900');
    expect(text).not.toContain('@');
  });

  it('пропускает пустой домен, хост площадки, невалидный slug; повтор хоста — первый', () => {
    expect(
      domainMapEntries([
        { slug: 'no-domain', domain: null },
        { slug: 'platform', domain: 'xn--24-6kc5aagh4arjl.xn--p1ai' },
        { slug: 'preview', domain: 'spec-ai-web-git-x.vercel.app' },
        { slug: 'Bad Slug', domain: 'bad.ru' },
        { slug: 'first', domain: 'cafe.ru' },
        { slug: 'second', domain: 'www.cafe.ru' },
        { slug: 'rf-site', domain: 'улыбка.рф' },
      ]),
    ).toEqual([
      { host: 'cafe.ru', slug: 'first' },
      { host: 'www.cafe.ru', slug: 'first' },
      { host: 'xn--80ab1ac3bxc.xn--p1ai', slug: 'rf-site' },
      { host: 'www.xn--80ab1ac3bxc.xn--p1ai', slug: 'rf-site' },
    ]);
  });

  it('в карту попадают только опубликованные сайты с доменом', () => {
    expect(DOMAIN_MAP_WHERE).toEqual({
      kind: 'site',
      status: 'PUBLISHED',
      domain: { not: null },
    });
  });
});

describe('parseDomainMap', () => {
  it('строит карту хост → slug, нормализуя хост', () => {
    const map = parseDomainMap(
      mapJson(['Ulybka-Kazan.RU:443', 'ulybka-kazan'], ['www.ulybka-kazan.ru', 'ulybka-kazan']),
    );
    expect([...map]).toEqual([
      ['ulybka-kazan.ru', 'ulybka-kazan'],
      ['www.ulybka-kazan.ru', 'ulybka-kazan'],
    ]);
  });

  it('мусор — пустая карта', () => {
    for (const junk of [null, undefined, 'text', 42, [], {}, { sites: 'x' }, { sites: null }]) {
      expect(parseDomainMap(junk).size).toBe(0);
    }
  });

  it('отбрасывает плохие записи, хосты площадки и повторы', () => {
    const map = parseDomainMap({
      sites: [
        null,
        'cafe.ru',
        { host: 'cafe.ru' },
        { host: 42, slug: 'cafe' },
        { host: '', slug: 'cafe' },
        { host: 'a b', slug: 'cafe' },
        { host: 'cafe.ru', slug: '../admin' },
        { host: 'cafe.ru', slug: 'x' },
        { host: 'иистройка24.рф', slug: 'hijack' },
        { host: 'localhost', slug: 'hijack' },
        { host: 'cafe.ru', slug: 'cafe' },
        { host: 'cafe.ru', slug: 'other' },
      ],
    });
    expect([...map]).toEqual([['cafe.ru', 'cafe']]);
  });

  it('не больше 4000 хостов', () => {
    const sites = Array.from({ length: 4100 }, (_, i) => ({ host: `site${i}.ru`, slug: `s-${i}` }));
    expect(parseDomainMap({ sites }).size).toBe(4000);
  });

  it('slug проверяется так же, как адреса /s/<slug>', () => {
    const samples = [
      'ulybka-kazan',
      'ab',
      'abc',
      'a'.repeat(80),
      'a'.repeat(81),
      'Abc',
      'a_b',
      'a/b',
    ];
    for (const slug of samples) {
      expect(parseDomainMap(mapJson(['a.ru', slug])).size).toBe(SLUG_RE.test(slug) ? 1 : 0);
    }
  });
});

describe('clientSiteFor и путь переписывания', () => {
  const map = parseDomainMap(mapJson(['ulybka-kazan.ru', 'ulybka-kazan']));

  it('домен клиента → его сайт; хост нормализуется', () => {
    expect(clientSiteFor('ULYBKA-KAZAN.ru:443', map)).toEqual({
      host: 'ulybka-kazan.ru',
      slug: 'ulybka-kazan',
    });
    expect(clientSitePath('ulybka-kazan')).toBe('/s/ulybka-kazan');
  });

  it('хост площадки и незнакомый домен — null', () => {
    const hijack = new Map([['xn--24-6kc5aagh4arjl.xn--p1ai', 'ulybka-kazan']]);
    expect(clientSiteFor('xn--24-6kc5aagh4arjl.xn--p1ai', hijack)).toBeNull();
    expect(clientSiteFor('spec-ai-web.vercel.app', map)).toBeNull();
    expect(clientSiteFor('localhost:3000', map)).toBeNull();
    expect(clientSiteFor('other.ru', map)).toBeNull();
    expect(clientSiteFor(null, map)).toBeNull();
    expect(clientSiteFor('', map)).toBeNull();
  });

  it('заголовок для страницы /s/<slug> — тот же, что она читает', () => {
    expect(CLIENT_DOMAIN_HEADER).toBe('x-client-domain');
  });
});

describe('getDomainMap: кэш в памяти на 5 минут', () => {
  beforeEach(() => resetDomainMapCache());

  it('грузит один раз за 5 минут, потом заново', async () => {
    const fetcher = vi.fn().mockResolvedValue(mapJson(['cafe.ru', 'cafe']));
    expect((await getDomainMap(fetcher, NOW)).get('cafe.ru')).toBe('cafe');
    await getDomainMap(fetcher, NOW + DOMAIN_MAP_TTL_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValue(mapJson(['cafe.ru', 'cafe-new']));
    expect((await getDomainMap(fetcher, NOW + DOMAIN_MAP_TTL_MS)).get('cafe.ru')).toBe('cafe-new');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('одновременные запросы ждут одну загрузку', async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetcher = vi.fn(() => new Promise((r) => (resolve = r)));
    const a = getDomainMap(fetcher, NOW);
    const b = getDomainMap(fetcher, NOW);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    resolve(mapJson(['cafe.ru', 'cafe']));
    const [ma, mb] = await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ma).toBe(mb);
    expect(ma.get('cafe.ru')).toBe('cafe');
  });

  it('ошибка без прошлой карты — пустая карта, повтор через 30 секунд', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('сеть'));
    expect((await getDomainMap(fetcher, NOW)).size).toBe(0);
    await getDomainMap(fetcher, NOW + DOMAIN_MAP_RETRY_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValue(mapJson(['cafe.ru', 'cafe']));
    expect((await getDomainMap(fetcher, NOW + DOMAIN_MAP_RETRY_MS)).get('cafe.ru')).toBe('cafe');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ошибка или не тот формат после удачной загрузки — прошлая карта', async () => {
    const fetcher = vi.fn().mockResolvedValue(mapJson(['cafe.ru', 'cafe']));
    await getDomainMap(fetcher, NOW);

    fetcher.mockRejectedValue(new Error('503'));
    const later = NOW + DOMAIN_MAP_TTL_MS;
    expect((await getDomainMap(fetcher, later)).get('cafe.ru')).toBe('cafe');

    fetcher.mockResolvedValue({ error: 'Список адресов сейчас недоступен' });
    expect((await getDomainMap(fetcher, later + DOMAIN_MAP_RETRY_MS)).get('cafe.ru')).toBe('cafe');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('загрузчик, бросающий сразу, не блокирует следующие попытки', async () => {
    const fetcher = vi.fn(() => {
      throw new Error('сразу');
    });
    expect((await getDomainMap(fetcher, NOW)).size).toBe(0);
    const ok = vi.fn().mockResolvedValue(mapJson(['cafe.ru', 'cafe']));
    expect((await getDomainMap(ok, NOW + DOMAIN_MAP_RETRY_MS)).get('cafe.ru')).toBe('cafe');
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('domainMapFetcher', () => {
  afterEach(() => vi.useRealTimers());

  it('берёт карту с того же адреса, что и запрос', async () => {
    const fetchImpl = vi.fn(async () => Response.json(mapJson(['cafe.ru', 'cafe'])));
    const json = await domainMapFetcher('https://cafe.ru', fetchImpl as unknown as typeof fetch)();
    expect(json).toEqual(mapJson(['cafe.ru', 'cafe']));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`https://cafe.ru${DOMAIN_MAP_PATH}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ответ не 200 — ошибка (останется прошлая карта)', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'нет' }, { status: 503 }));
    await expect(
      domainMapFetcher('https://cafe.ru', fetchImpl as unknown as typeof fetch)(),
    ).rejects.toThrow();
  });

  it('долгий ответ прерывается по таймауту', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('прервано')));
        }),
    );
    const pending = domainMapFetcher('https://cafe.ru', fetchImpl as unknown as typeof fetch)();
    const check = expect(pending).rejects.toThrow('прервано');
    await vi.advanceTimersByTimeAsync(3_000);
    await check;
  });
});
