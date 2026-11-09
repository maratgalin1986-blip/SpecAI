// Свой домен клиента (S7): карта «хост клиента → slug его опубликованного сайта» для middleware.
// Middleware работает на edge и в базу не ходит: карту отдаёт GET /api/office/domains с адреса
// площадки (siteUrl(), не из запроса), здесь она проверяется и держится в памяти модуля 5 минут.
// Модуль не тянет базу данных (только lib/office/domains и lib/siteUrl), поэтому его можно
// импортировать в middleware.

import { siteUrl } from '@/lib/siteUrl';
import { domainKeys, isPlatformHost, normalizeHost } from './domains';

/** Откуда middleware берёт карту (app/api/office/domains/route.ts). */
export const DOMAIN_MAP_PATH = '/api/office/domains';

/** Заголовок запроса, которым middleware передаёт странице /s/<slug> хост клиента. */
export const CLIENT_DOMAIN_HEADER = 'x-client-domain';

/** Сколько карта живёт в памяти middleware и в кэше CDN. */
export const DOMAIN_MAP_TTL_MS = 5 * 60_000;
export const DOMAIN_MAP_CACHE_SECONDS = DOMAIN_MAP_TTL_MS / 1000;

/** После ошибки загрузки — через сколько пробовать снова (до тех пор — прошлая карта). */
export const DOMAIN_MAP_RETRY_MS = 30_000;

/** Дольше этого страница клиента карту не ждёт: открывается как без домена. */
export const DOMAIN_MAP_TIMEOUT_MS = 3_000;

/** Сколько сайтов с доменом отдаёт маршрут (у каждого два хоста: с www и без). */
export const DOMAIN_MAP_MAX_SITES = 2000;
const MAX_HOSTS = DOMAIN_MAP_MAX_SITES * 2;

/** Адрес опубликованной страницы — как SLUG_RE в lib/office/visibility.ts (тот модуль грузит базу). */
const SLUG_RE = /^[a-z0-9-]{3,80}$/;

/** Какие строки попадают в карту: только опубликованные сайты с подключённым доменом. */
export const DOMAIN_MAP_WHERE = {
  kind: 'site',
  status: 'PUBLISHED',
  domain: { not: null },
};

export type DomainMapEntry = { host: string; slug: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ответ GET /api/office/domains из строк базы: для каждого сайта оба хоста (с «www.» и без),
 * только хост и slug — без имён, телефонов и id. Хост площадки, невалидный slug или домен
 * пропускаются; один хост — один сайт (первый в списке).
 */
export function domainMapEntries(
  rows: readonly { slug: string; domain: string | null }[],
): DomainMapEntry[] {
  const out: DomainMapEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.domain || !SLUG_RE.test(row.slug)) continue;
    for (const host of domainKeys(row.domain)) {
      if (isPlatformHost(host) || seen.has(host)) continue;
      seen.add(host);
      out.push({ host, slug: row.slug });
    }
  }
  return out;
}

function hasSites(json: unknown): json is { sites: unknown[] } {
  return isRecord(json) && Array.isArray(json.sites);
}

/**
 * Карта из ответа маршрута: `{ sites: [{ host, slug }] }` → `Map<host, slug>`. Мусор, хосты
 * площадки и невалидные slug отбрасываются, хост нормализуется (регистр, порт, punycode);
 * при повторе хоста остаётся первый. Не тот формат — пустая карта.
 */
export function parseDomainMap(json: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!hasSites(json)) return map;
  for (const item of json.sites) {
    if (map.size >= MAX_HOSTS) break;
    if (!isRecord(item) || typeof item.host !== 'string' || typeof item.slug !== 'string') continue;
    const host = normalizeHost(item.host);
    if (!host || isPlatformHost(host) || !SLUG_RE.test(item.slug) || map.has(host)) continue;
    map.set(host, item.slug);
  }
  return map;
}

/** Сайт клиента для хоста запроса; хост площадки или незнакомый — null (обычная площадка). */
export function clientSiteFor(
  host: string | null | undefined,
  map: ReadonlyMap<string, string>,
): DomainMapEntry | null {
  if (isPlatformHost(host)) return null;
  const h = normalizeHost(host);
  const slug = map.get(h);
  return slug ? { host: h, slug } : null;
}

/** Куда middleware переписывает любую страницу домена клиента: на главную его сайта. */
export function clientSitePath(slug: string): string {
  return `/s/${slug}`;
}

/** Загрузчик карты: возвращает JSON ответа или бросает ошибку. */
export type DomainMapFetcher = () => Promise<unknown>;

/**
 * Откуда брать карту: только адрес площадки из настроек (siteUrl()), никогда не origin запроса.
 * Origin запроса — это хост, который прислал посетитель: с подставленным Host карту отдал бы
 * чужой сервер, и она в общей памяти модуля открыла бы на домене одного клиента сайт другого.
 */
export function domainMapOrigin(): string {
  return siteUrl();
}

/** Загрузчик карты с адреса `origin` (domainMapOrigin()), не дольше DOMAIN_MAP_TIMEOUT_MS. */
export function domainMapFetcher(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): DomainMapFetcher {
  return async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOMAIN_MAP_TIMEOUT_MS);
    try {
      const response = await fetchImpl(new URL(DOMAIN_MAP_PATH, origin), {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`карта доменов: HTTP ${response.status}`);
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  };
}

let cache: { map: Map<string, string>; expiresAt: number } | null = null;
let pending: Promise<Map<string, string>> | null = null;

/**
 * Карта из памяти модуля; раз в 5 минут — заново через `fetcher` (одновременные запросы ждут
 * одну загрузку). Ошибка или не тот формат — прошлая карта (или пустая), новая попытка через
 * DOMAIN_MAP_RETRY_MS. Никогда не бросает: без карты домены клиентов открывают площадку, как раньше.
 */
export function getDomainMap(
  fetcher: DomainMapFetcher,
  now: number = Date.now(),
): Promise<Map<string, string>> {
  if (cache && now < cache.expiresAt) return Promise.resolve(cache.map);
  if (pending) return pending;
  const previous = cache?.map ?? new Map<string, string>();
  const run: Promise<Map<string, string>> = Promise.resolve()
    .then(fetcher)
    .then((json) => {
      if (!hasSites(json)) throw new Error('карта доменов: не тот формат ответа');
      const map = parseDomainMap(json);
      cache = { map, expiresAt: now + DOMAIN_MAP_TTL_MS };
      return map;
    })
    .catch(() => {
      cache = { map: previous, expiresAt: now + DOMAIN_MAP_RETRY_MS };
      return previous;
    })
    .finally(() => {
      if (pending === run) pending = null;
    });
  pending = run;
  return run;
}

/** Для тестов: забыть карту и незавершённую загрузку. */
export function resetDomainMapCache(): void {
  cache = null;
  pending = null;
}
