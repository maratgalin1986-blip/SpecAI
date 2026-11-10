// Источник кандидатов — открытые данные OpenStreetMap через Overpass API (R5).
// Без ключа; компании ниши в радиусе города с названием и телефоном, без сайта.

import { GEO_USER_AGENT } from '@/lib/geo';
import { capWithoutSite } from './limit';
import { candidateEmail, candidatePhone, candidateTelegram } from './phone';
import type { Candidate, Neighbor, ProspectSource, SourceCity, SourceNiche } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/**
 * Зеркала Overpass по порядку: основное, затем запасные. Overpass не любит
 * адреса облаков (сбрасывает соединение или молчит), поэтому при отказе одного
 * зеркала шаг пробует следующее; на каждое — свой таймаут, общий — не больше
 * OVERPASS_TOTAL_MS, чтобы крон успел записать результат.
 */
export const OVERPASS_MIRRORS: readonly string[] = [
  OVERPASS_URL,
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/**
 * Зеркала для раннера GitHub Actions (.github/scripts/office-relay.sh), по порядку. Проба
 * 10.11.2026 с раннера: overpass-api.de ответил сразу 502 «at capacity» (доступен, нужна повторная
 * попытка), maps.mail.ru — HTTP 200 за 19 с (1045 объектов, 336 КБ); overpass.kumi.systems и
 * overpass.private.coffee молчали 45 с — их здесь нет.
 */
export const OVERPASS_RELAY_MIRRORS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
export const OVERPASS_TOTAL_MS = 40_000;
export const OVERPASS_TIMEOUT_MS = 25_000;
export const OVERPASS_UNAVAILABLE = 'Источник карт не ответил';

export function buildOverpassQuery(niche: SourceNiche, city: SourceCity, radiusKm: number): string {
  const radius = Math.round(radiusKm * 1000);
  // Фильтр по названию выполняет сам сервер (регистронезависимо), иначе
  // office=company в Москве — десятки тысяч объектов и таймаут.
  const byName = niche.osmNameFilter ? `["name"~"${niche.osmNameFilter.replace(/"/g, '')}",i]` : '';
  const parts = niche.osm.map(
    // «*» в значении тега — любой объект с этим ключом (industrial=*, craft=*).
    ([k, v]) =>
      `nwr[${v === '*' ? `"${k}"` : `"${k}"="${v}"`}]${byName}(around:${radius},${city.lat},${city.lon});`,
  );
  return `[out:json][timeout:25];(${parts.join('')});out center tags;`;
}

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown } | null;
  tags?: Record<string, unknown> | null;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringTags(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

function buildAddress(tags: Record<string, string>): string | null {
  const street = str(tags['addr:street']);
  const house = str(tags['addr:housenumber']);
  const city = str(tags['addr:city']);
  const parts = [street, house, city].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(', ') : null;
}

function overpassElements(json: unknown): OverpassElement[] {
  return json &&
    typeof json === 'object' &&
    Array.isArray((json as { elements?: unknown }).elements)
    ? ((json as { elements: unknown[] }).elements as OverpassElement[])
    : [];
}

function elementRef(el: OverpassElement): string | null {
  const id = typeof el.id === 'number' || typeof el.id === 'string' ? String(el.id) : null;
  return id ? `osm:${str(el.type) ?? 'node'}/${id}` : null;
}

/**
 * Все названные объекты ниши с координатами — и без телефона: по ним досье считает
 * конкурентов рядом. Кандидатами становятся только объекты с телефоном (`parseOverpass`).
 */
export function parseOverpassNeighbors(json: unknown, niche: SourceNiche): Neighbor[] {
  const seen = new Set<string>();
  const result: Neighbor[] = [];
  for (const el of overpassElements(json)) {
    if (!el || typeof el !== 'object' || !el.tags || typeof el.tags !== 'object') continue;
    const tags = stringTags(el.tags);
    const name = str(tags.name);
    if (!name) continue;
    if (niche.nameRegex && !niche.nameRegex.test(name)) continue;
    const ref = elementRef(el);
    const lat = num(el.lat) ?? num(el.center?.lat);
    const lon = num(el.lon) ?? num(el.center?.lon);
    if (!ref || lat === null || lon === null || seen.has(ref)) continue;
    seen.add(ref);
    result.push({
      ref,
      lat,
      lon,
      hasSite: Boolean(str(tags.website) ?? str(tags['contact:website']) ?? str(tags.url)),
    });
  }
  return result;
}

export function parseOverpass(json: unknown, niche: SourceNiche): Candidate[] {
  const elements = overpassElements(json);
  const seenPhones = new Set<string>();
  const result: Candidate[] = [];

  for (const el of elements) {
    if (!el || typeof el !== 'object' || !el.tags || typeof el.tags !== 'object') continue;
    const tags = stringTags(el.tags);
    const name = str(tags.name);
    if (!name) continue;
    if (niche.nameRegex && !niche.nameRegex.test(name)) continue;

    const phone =
      candidatePhone(tags.phone) ??
      candidatePhone(tags['contact:phone']) ??
      candidatePhone(tags['contact:mobile']);
    if (!phone || seenPhones.has(phone)) continue;
    seenPhones.add(phone);

    const sourceRef = elementRef(el);
    if (!sourceRef) continue;

    result.push({
      name,
      phone,
      address: buildAddress(tags),
      lat: num(el.lat) ?? num(el.center?.lat),
      lon: num(el.lon) ?? num(el.center?.lon),
      hours: str(tags.opening_hours),
      website: str(tags.website) ?? str(tags['contact:website']) ?? str(tags.url),
      email: candidateEmail(tags.email) ?? candidateEmail(tags['contact:email']),
      whatsapp: candidatePhone(tags['contact:whatsapp']),
      telegram: candidateTelegram(tags['contact:telegram']),
      tags: niche.machineryTags?.(name, tags) ?? [],
      sourceRef,
    });
  }
  return result;
}

/**
 * Кандидаты без сайта — им и предлагаем сайт под ключ (R5). Источники отдают всех: фирмы с
 * сайтом нужны досье для подсчёта конкурентов, отбор делает прогон (`run.ts`).
 */
export function withoutWebsite(list: Candidate[]): Candidate[] {
  return list.filter((c) => !c.website);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createOsmSource(
  fetchImpl?: FetchLike,
  mirrors: readonly string[] = OVERPASS_MIRRORS,
  clock: () => number = Date.now,
): ProspectSource {
  return {
    id: 'osm',
    async search({ niche, city, radiusKm, limit, budgetMs }) {
      const total = Math.min(OVERPASS_TOTAL_MS, Math.max(0, budgetMs ?? OVERPASS_TOTAL_MS));
      const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
      const query = buildOverpassQuery(niche, city, radiusKm);
      const startedAt = clock();
      for (const url of mirrors) {
        const left = total - (clock() - startedAt);
        if (left < 3_000) break;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(OVERPASS_TIMEOUT_MS, left));
        try {
          const response = await doFetch(url, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': GEO_USER_AGENT,
            },
            signal: controller.signal,
          });
          // 4xx — ошибка запроса, другое зеркало её не исправит; 5xx/429 — пробуем дальше.
          if (!response.ok) {
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              return { status: 'unavailable', error: OVERPASS_UNAVAILABLE };
            }
            continue;
          }
          const json: unknown = await response.json();
          return {
            status: 'ok',
            // `limit` — только фирмы без сайта; с сайтом все остаются соседями для досье.
            candidates: capWithoutSite(parseOverpass(json, niche), limit),
            neighbors: parseOverpassNeighbors(json, niche),
          };
        } catch {
          // сеть, таймаут, не JSON — следующее зеркало
        } finally {
          clearTimeout(timer);
        }
      }
      return { status: 'unavailable', error: OVERPASS_UNAVAILABLE };
    },
  };
}

export const osmSource: ProspectSource = createOsmSource();
