// Источник кандидатов — поиск Nominatim (тот же OpenStreetMap, что и Overpass, но другой
// сервис). Overpass сбрасывает соединения с адресов облаков: на продакшене все шаги 9–10.11.2026
// закончились «Источник карт не ответил». Nominatim с Vercel отвечает (им уже пользуется
// геокодер, lib/geo.ts) и по запросу «[ключ=значение]» в рамке города отдаёт объекты с тегами
// карточки (extratags): телефон, сайт, часы, почта, WhatsApp.
// Правила сервиса: не чаще одного запроса в секунду и свой User-Agent — между запросами пауза,
// за шаг не больше NOMINATIM_MAX_REQUESTS запросов. Систематически выгружать объекты через
// Nominatim правила OSMF запрещают, поэтому это запасной путь: основной поиск идёт через Overpass
// с раннера GitHub (.github/scripts/office-relay.sh). Ответ — выборка (до 50–100 объектов на тег):
// `sample: true`, конкурентов по ней досье не считает.

import { capWithoutSite } from './limit';
import { parseOverpass } from './osm';
import type { ProspectSource, SourceCity, SourceNiche } from './types';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Больше 50 объектов за запрос сервис не отдаёт. */
export const NOMINATIM_PAGE = 50;
/** Повторная попытка тоже считается запросом. */
export const NOMINATIM_MAX_REQUESTS = 3;
/** Свой User-Agent офиса: если сервис заблокирует поиск, геокодер сайта (GEO_USER_AGENT) не пострадает. */
export const OFFICE_USER_AGENT =
  'SpecPlast16-office/1.0 (+https://xn--24-6kc5aagh4arjl.xn--p1ai; specplast16@yandex.ru)';
export const NOMINATIM_TIMEOUT_MS = 8_000;
/** Пауза между запросами: правило сервиса — не чаще раза в секунду. */
export const NOMINATIM_PAUSE_MS = 1_100;
export const NOMINATIM_UNSUPPORTED = 'Эта ниша ищется только по расписанию, через Overpass';
export const NOMINATIM_UNAVAILABLE = 'Источник карт не ответил';

/** Рамка поиска вокруг центра города: «запад,север,восток,юг», как ждёт Nominatim. */
export function viewbox(city: SourceCity, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((city.lat * Math.PI) / 180)));
  const f = (n: number) => n.toFixed(4);
  return [f(city.lon - dLon), f(city.lat + dLat), f(city.lon + dLon), f(city.lat - dLat)].join(',');
}

/**
 * Что спрашивать: «[ключ=значение]» по тегам ниши. Для ниш с фильтром по названию (техника)
 * запросов нет: Nominatim ищет по названиям, а не по виду деятельности — замер дал ноль строк.
 */
export function nominatimQueries(niche: SourceNiche): string[] {
  if (niche.nameRegex) return [];
  return niche.osm.filter(([, v]) => v !== '*').map(([k, v]) => `[${k}=${v}]`);
}

type Row = {
  place_id?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
  lat?: unknown;
  lon?: unknown;
  name?: unknown;
  extratags?: Record<string, unknown> | null;
  address?: Record<string, unknown> | null;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Ответ Nominatim в виде, который разбирает parseOverpass: те же теги OSM. */
export function toOverpassElements(rows: unknown): { elements: unknown[] } {
  const elements: unknown[] = [];
  for (const row of Array.isArray(rows) ? (rows as Row[]) : []) {
    if (!row || typeof row !== 'object') continue;
    const name = text(row.name);
    const id = typeof row.osm_id === 'number' ? row.osm_id : null;
    if (!name || id === null) continue;
    const address = row.address ?? {};
    const tags: Record<string, unknown> = { ...(row.extratags ?? {}), name };
    const street = text(address.road);
    const house = text(address.house_number);
    const city = text(address.city) ?? text(address.town) ?? text(address.village);
    if (street) tags['addr:street'] = street;
    if (house) tags['addr:housenumber'] = house;
    if (city) tags['addr:city'] = city;
    elements.push({
      type: text(row.osm_type) ?? 'node',
      id,
      lat: Number(row.lat),
      lon: Number(row.lon),
      tags,
    });
  }
  return { elements };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createNominatimSource(
  fetchImpl?: FetchLike,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  clock: () => number = Date.now,
): ProspectSource {
  return {
    id: 'nominatim',
    async search({ niche, city, radiusKm, limit, budgetMs }) {
      const queries = nominatimQueries(niche);
      // Нишу с фильтром по названию (техника) Nominatim искать не умеет: честный отказ, а не
      // «найдено 0» — иначе шаг, в котором ничего не искали, записался бы успешным.
      if (queries.length === 0) return { status: 'unavailable', error: NOMINATIM_UNSUPPORTED };
      const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
      const startedAt = clock();
      const left = () => (budgetMs === undefined ? Infinity : budgetMs - (clock() - startedAt));
      const box = viewbox(city, radiusKm);
      const elements: unknown[] = [];
      const seen = new Set<string>();
      let requests = 0;
      let answered = false;

      for (const q of queries) {
        const exclude: string[] = [];
        // Вторая страница — только если первая пришла полной.
        for (let page = 0; page < 2; page++) {
          if (requests >= NOMINATIM_MAX_REQUESTS || left() < NOMINATIM_TIMEOUT_MS) break;
          if (requests > 0) await sleep(NOMINATIM_PAUSE_MS);
          requests++;
          const params = new URLSearchParams({
            q,
            viewbox: box,
            bounded: '1',
            limit: String(NOMINATIM_PAGE),
            format: 'jsonv2',
            extratags: '1',
            addressdetails: '1',
            'accept-language': 'ru',
          });
          if (exclude.length) params.set('exclude_place_ids', exclude.join(','));
          // Разовый сбой сети или 5xx — одна повторная попытка после паузы.
          let rows: Row[] | null = null;
          for (let attempt = 0; attempt < 2 && rows === null; attempt++) {
            if (attempt > 0) {
              if (requests >= NOMINATIM_MAX_REQUESTS || left() < NOMINATIM_TIMEOUT_MS) break;
              await sleep(NOMINATIM_PAUSE_MS);
              requests++;
            }
            try {
              const response = await doFetch(`${NOMINATIM_URL}?${params.toString()}`, {
                headers: { 'User-Agent': OFFICE_USER_AGENT, Accept: 'application/json' },
                signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
              });
              if (!response.ok) continue;
              const json: unknown = await response.json();
              if (Array.isArray(json)) rows = json as Row[];
            } catch {
              // следующая попытка
            }
          }
          if (rows === null) break;
          answered = true;
          for (const el of toOverpassElements(rows).elements as { type: string; id: number }[]) {
            const key = `${el.type}/${el.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            elements.push(el);
          }
          if (rows.length < NOMINATIM_PAGE) break;
          for (const row of rows) {
            if (typeof row.place_id === 'number') exclude.push(String(row.place_id));
          }
        }
      }
      if (!answered) return { status: 'unavailable', error: NOMINATIM_UNAVAILABLE };
      return {
        status: 'ok',
        candidates: capWithoutSite(parseOverpass({ elements }, niche), limit),
        sample: true,
      };
    },
  };
}

export const nominatimSource: ProspectSource = createNominatimSource();
