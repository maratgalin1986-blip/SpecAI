// Источник кандидатов — 2ГИС (Places API, catalog.api.2gis.com). Карточки в
// 2ГИС полнее OSM: у большинства компаний есть телефон, часто — почта и
// WhatsApp. Нужен ключ `DGIS_API_KEY` (dev.2gis.ru, есть бесплатный тариф);
// без ключа источник не создаётся и офис ищет только в OSM (`run.ts`).
// Ответ разбирается без доверия к полям: всё необязательное.

import { GEO_USER_AGENT } from '@/lib/geo';
import { capWithoutSite, countWithoutSite } from './limit';
import { candidateEmail, candidatePhone, candidateTelegram } from './phone';
import type { Candidate, ProspectSource, SourceNiche } from './types';

export const DGIS_URL = 'https://catalog.api.2gis.com/3.0/items';
/** Больше 2ГИС на страницу не отдаёт. */
export const DGIS_PAGE_SIZE = 50;
/** Страниц за один шаг — больше не нужно: шаг берёт первые десять новых. */
export const DGIS_MAX_PAGES = 4;
export const DGIS_TIMEOUT_MS = 12_000;
export const DGIS_UNAVAILABLE = '2ГИС не ответил';

/** Поисковая фраза для ниши; без неё 2ГИС для этой ниши не спрашивается. */
export function dgisQuery(niche: Pick<SourceNiche, 'key' | 'dgisQuery'>): string | null {
  return niche.dgisQuery?.trim() || null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface DgisContact {
  type?: unknown;
  value?: unknown;
  text?: unknown;
  url?: unknown;
}
interface DgisItem {
  id?: unknown;
  name?: unknown;
  address_name?: unknown;
  point?: { lat?: unknown; lon?: unknown };
  contact_groups?: { contacts?: DgisContact[] }[];
  schedule?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Контакты карточки по типам 2ГИС: phone, email, website, whatsapp, telegram. */
function contactsOf(item: DgisItem): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of item.contact_groups ?? []) {
    for (const contact of group.contacts ?? []) {
      const type = str(contact.type)?.toLowerCase();
      const value = str(contact.value) ?? str(contact.text) ?? str(contact.url);
      if (!type || !value) continue;
      (out[type] ??= []).push(value);
    }
  }
  return out;
}

/** Расписание 2ГИС — объект по дням; показываем только «пн–пт 09:00–18:00», если все будни одинаковы. */
export function dgisHours(schedule: unknown): string | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
  const ranges = days.map((day) => {
    const value = (
      schedule as Record<string, { working_hours?: { from?: unknown; to?: unknown }[] }>
    )[day];
    const first = value?.working_hours?.[0];
    const from = str(first?.from);
    const to = str(first?.to);
    return from && to ? `${from}–${to}` : null;
  });
  const first = ranges[0];
  if (!first || ranges.some((r) => r !== first)) return null;
  return `Пн–Пт ${first}`;
}

/** Карточки 2ГИС → кандидаты: с названием и телефоном, без дублей по телефону. */
export function parseDgis(json: unknown): Candidate[] {
  const items = (json as { result?: { items?: unknown } } | null)?.result?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const raw of items as DgisItem[]) {
    const name = str(raw?.name);
    const id = str(raw?.id);
    if (!name || !id) continue;
    const contacts = contactsOf(raw);
    const phone = (contacts.phone ?? []).map(candidatePhone).find((p): p is string => !!p) ?? null;
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const website = contacts.website?.[0] ?? null;
    out.push({
      name,
      phone,
      address: str(raw.address_name),
      lat: num(raw.point?.lat),
      lon: num(raw.point?.lon),
      hours: dgisHours(raw.schedule),
      website: website ? website : null,
      email: (contacts.email ?? []).map(candidateEmail).find((e): e is string => !!e) ?? null,
      whatsapp: (contacts.whatsapp ?? []).map(candidatePhone).find((p): p is string => !!p) ?? null,
      telegram:
        (contacts.telegram ?? []).map(candidateTelegram).find((t): t is string => !!t) ?? null,
      tags: [],
      sourceRef: `2gis:${id}`,
    });
  }
  return out;
}

export function dgisUrl(
  key: string,
  query: string,
  city: { lat: number; lon: number },
  radiusKm: number,
  page: number,
): string {
  const params = new URLSearchParams({
    q: query,
    point: `${city.lon},${city.lat}`,
    radius: String(Math.min(40_000, Math.round(radiusKm * 1000))),
    fields: 'items.point,items.contact_groups,items.address_name,items.schedule',
    page_size: String(DGIS_PAGE_SIZE),
    page: String(page),
    key,
  });
  return `${DGIS_URL}?${params.toString()}`;
}

/** Источник 2ГИС; `null`, когда ключа нет. */
export function createDgisSource(
  key: string | undefined = process.env.DGIS_API_KEY,
  fetchImpl?: FetchLike,
  clock: () => number = Date.now,
): ProspectSource | null {
  const apiKey = key?.trim();
  if (!apiKey) return null;
  return {
    id: '2gis',
    async search({ niche, city, radiusKm, limit, budgetMs }) {
      const query = dgisQuery(niche);
      if (!query) return { status: 'ok', candidates: [] };
      const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
      const startedAt = clock();
      const total = Math.max(0, budgetMs ?? DGIS_TIMEOUT_MS * DGIS_MAX_PAGES);
      const found: Candidate[] = [];
      let answered = false;
      for (let page = 1; page <= DGIS_MAX_PAGES; page++) {
        const left = total - (clock() - startedAt);
        if (left < 2_000) break;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(DGIS_TIMEOUT_MS, left));
        try {
          const response = await doFetch(dgisUrl(apiKey, query, city, radiusKm, page), {
            headers: { 'User-Agent': GEO_USER_AGENT },
            signal: controller.signal,
          });
          if (!response.ok) break;
          const json: unknown = await response.json();
          answered = true;
          const batch = parseDgis(json);
          // Для техники — как в OSM: только совпавшие по названию.
          const kept = niche.nameRegex ? batch.filter((c) => niche.nameRegex!.test(c.name)) : batch;
          for (const c of kept) {
            if (niche.machineryTags) c.tags = niche.machineryTags(c.name, {});
            found.push(c);
          }
          if (batch.length < DGIS_PAGE_SIZE || countWithoutSite(found) >= limit) break;
        } catch {
          break;
        } finally {
          clearTimeout(timer);
        }
      }
      if (!answered) return { status: 'unavailable', error: DGIS_UNAVAILABLE };
      return {
        status: 'ok',
        // Все с сайтом (соседи для досье) и не больше `limit` без сайта — кандидатов отбирает прогон.
        candidates: capWithoutSite(found, limit),
      };
    },
  };
}
