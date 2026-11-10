// Источник кандидатов — 2ГИС (Places API, catalog.api.2gis.com). По умолчанию
// ВЫКЛЮЧЕН. Факты сверены с документами 2ГИС 10.11.2026:
// - постоянного тарифа без оплаты нет: есть только разовый демо-ключ — 1 месяц,
//   1 000 запросов, `page_size` не больше 10;
// - поле `items.contact_groups` (телефоны, почта, WhatsApp) — платное разрешение
//   по запросу; без него поле в ответе просто отсутствует;
// - ошибки приходят с HTTP 200 и кодом в `meta.code` (400/403/404/408/503);
// - лицензия на API (law.2gis.ru, п. 3.1) запрещает извлекать и ХРАНИТЬ данные,
//   а офис именно сохраняет карточки (строки Prospect); для платных подписчиков
//   за это предусмотрен фиксированный штраф.
// Поэтому источник создаётся, только когда заданы и `DGIS_API_KEY`, и
// `DGIS_STORAGE_ALLOWED=1`; флаг ставят лишь при договоре с 2ГИС, который
// разрешает хранить данные API. Законный путь собрать базу клиентов из 2ГИС —
// платная выгрузка «Дата.2ГИС». Без источника офис ищет только в OSM (`run.ts`).
// Ответ разбирается без доверия к полям: всё необязательное.

import { GEO_USER_AGENT } from '@/lib/geo';
import { capWithoutSite, countWithoutSite } from './limit';
import { candidateEmail, candidatePhone, candidateTelegram } from './phone';
import type { Candidate, ProspectSource, SourceNiche } from './types';

export const DGIS_URL = 'https://catalog.api.2gis.com/3.0/items';
/** Размер страницы по умолчанию; у демо-ключа предел — 10 (аргумент `pageSize`). */
export const DGIS_PAGE_SIZE = 50;
/** Страниц за один шаг — больше не нужно: шаг берёт первые десять новых. */
export const DGIS_MAX_PAGES = 4;
export const DGIS_TIMEOUT_MS = 12_000;
export const DGIS_UNAVAILABLE = '2ГИС не ответил';
export const DGIS_NO_CONTACTS = '2ГИС: у ключа нет доступа к контактам';
/** «Ничего не найдено» — не ошибка, а пустой ответ. */
const DGIS_NOT_FOUND = 404;

type Env = Record<string, string | undefined>;

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

/** Сырые карточки страницы — по их числу решаем, есть ли следующая страница. */
function rawItems(json: unknown): DgisItem[] {
  const items = (json as { result?: { items?: unknown } } | null)?.result?.items;
  return Array.isArray(items) ? (items as DgisItem[]) : [];
}

/** Код ответа из `meta.code`; ошибки 2ГИС отдаёт с HTTP 200. Нет поля — считаем 200. */
export function dgisMetaCode(json: unknown): number {
  const code = (json as { meta?: { code?: unknown } } | null)?.meta?.code;
  return typeof code === 'number' && Number.isFinite(code) ? code : 200;
}

/** Карточки 2ГИС → кандидаты: с названием и телефоном, без дублей по телефону. */
export function parseDgis(json: unknown): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const raw of rawItems(json)) {
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
  pageSize: number = DGIS_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    q: query,
    type: 'branch',
    point: `${city.lon},${city.lat}`,
    radius: String(Math.min(40_000, Math.round(radiusKm * 1000))),
    fields: 'items.point,items.contact_groups,items.address_name,items.schedule',
    page_size: String(pageSize),
    page: String(page),
    key,
  });
  return `${DGIS_URL}?${params.toString()}`;
}

/**
 * Источник 2ГИС; `null`, пока нет ключа ИЛИ нет `DGIS_STORAGE_ALLOWED=1`
 * (договор, разрешающий хранить данные API). `pageSize` можно только уменьшить.
 */
export function createDgisSource(
  env: Env = process.env,
  fetchImpl?: FetchLike,
  clock: () => number = Date.now,
  pageSize: number = DGIS_PAGE_SIZE,
): ProspectSource | null {
  const apiKey = env.DGIS_API_KEY?.trim();
  if (!apiKey || env.DGIS_STORAGE_ALLOWED?.trim() !== '1') return null;
  const size = Math.max(1, Math.min(DGIS_PAGE_SIZE, Math.floor(pageSize) || DGIS_PAGE_SIZE));
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
      let failure: string | null = null;
      for (let page = 1; page <= DGIS_MAX_PAGES; page++) {
        const left = total - (clock() - startedAt);
        if (left < 2_000) break;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(DGIS_TIMEOUT_MS, left));
        try {
          const response = await doFetch(dgisUrl(apiKey, query, city, radiusKm, page, size), {
            headers: { 'User-Agent': GEO_USER_AGENT },
            signal: controller.signal,
          });
          if (!response.ok) break;
          const json: unknown = await response.json();
          const code = dgisMetaCode(json);
          if (code === DGIS_NOT_FOUND) {
            answered = true;
            break;
          }
          if (code !== 200) {
            failure = `2ГИС: код ${code}`;
            break;
          }
          const raw = rawItems(json);
          // Без платного разрешения поля контактов нет ни у одной карточки.
          if (raw.length > 0 && !raw.some((it) => Array.isArray(it?.contact_groups))) {
            failure = DGIS_NO_CONTACTS;
            break;
          }
          answered = true;
          const batch = parseDgis(json);
          // Для техники — как в OSM: только совпавшие по названию.
          const kept = niche.nameRegex ? batch.filter((c) => niche.nameRegex!.test(c.name)) : batch;
          for (const c of kept) {
            if (niche.machineryTags) c.tags = niche.machineryTags(c.name, {});
            found.push(c);
          }
          // Полнота страницы — по сырым карточкам: без телефона отсеивается много.
          if (raw.length < size || countWithoutSite(found) >= limit) break;
        } catch {
          break;
        } finally {
          clearTimeout(timer);
        }
      }
      // Ошибка на первой же странице — источник недоступен; на следующих — отдаём найденное.
      if (!answered) return { status: 'unavailable', error: failure ?? DGIS_UNAVAILABLE };
      return {
        status: 'ok',
        // Все с сайтом (соседи для досье) и не больше `limit` без сайта — кандидатов отбирает прогон.
        candidates: capWithoutSite(found, limit),
        // Список неполный (только карточки с телефоном, не больше DGIS_MAX_PAGES страниц):
        // числа «сколько конкурентов рядом» по нему не считаются.
        sample: true,
      };
    },
  };
}
