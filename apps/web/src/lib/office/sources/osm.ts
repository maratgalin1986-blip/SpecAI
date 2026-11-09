// Источник кандидатов — открытые данные OpenStreetMap через Overpass API (R5).
// Без ключа; компании ниши в радиусе города с названием и телефоном, без сайта.

import { GEO_USER_AGENT } from '@/lib/geo';
import { candidateEmail, candidatePhone, candidateTelegram } from './phone';
import type { Candidate, ProspectSource, SourceCity, SourceNiche } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_TIMEOUT_MS = 25_000;
export const OVERPASS_UNAVAILABLE = 'Источник карт не ответил';

export function buildOverpassQuery(niche: SourceNiche, city: SourceCity, radiusKm: number): string {
  const radius = Math.round(radiusKm * 1000);
  const parts = niche.osm.map(
    // «*» в значении тега — любой объект с этим ключом (industrial=*, craft=*).
    ([k, v]) =>
      `nwr[${v === '*' ? `"${k}"` : `"${k}"="${v}"`}](around:${radius},${city.lat},${city.lon});`,
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

export function parseOverpass(json: unknown, niche: SourceNiche): Candidate[] {
  const elements =
    json && typeof json === 'object' && Array.isArray((json as { elements?: unknown }).elements)
      ? ((json as { elements: unknown[] }).elements as OverpassElement[])
      : [];
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

    const type = str(el.type) ?? 'node';
    const id = typeof el.id === 'number' || typeof el.id === 'string' ? String(el.id) : null;
    if (!id) continue;

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
      sourceRef: `osm:${type}/${id}`,
    });
  }
  return result;
}

/** Кандидаты без сайта — им и предлагаем сайт под ключ (R5). */
export function withoutWebsite(list: Candidate[]): Candidate[] {
  return list.filter((c) => !c.website);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createOsmSource(fetchImpl?: FetchLike): ProspectSource {
  return {
    id: 'osm',
    async search({ niche, city, radiusKm, limit }) {
      const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
      const query = buildOverpassQuery(niche, city, radiusKm);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      try {
        const response = await doFetch(OVERPASS_URL, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': GEO_USER_AGENT,
          },
          signal: controller.signal,
        });
        if (!response.ok) return { status: 'unavailable', error: OVERPASS_UNAVAILABLE };
        const json: unknown = await response.json();
        return {
          status: 'ok',
          candidates: withoutWebsite(parseOverpass(json, niche)).slice(0, Math.max(0, limit)),
        };
      } catch {
        return { status: 'unavailable', error: OVERPASS_UNAVAILABLE };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const osmSource: ProspectSource = createOsmSource();
