// «Актуализация» (2026-10-18): the platform itself, openly as ИИСтройка24, asks
// its registered providers once a week to confirm prices and free days of
// their machines. Never a fake customer, never anyone outside the platform:
// only PROVIDER_ADMIN users of provider companies with machinery, and never
// СпецПласт16's own fleet (its prices are the owner's, lib/prices.ts).
// Pure helpers, safe for client components; the database side is in
// lib/aktualnoData.ts.

import { HOUSE_COMPANY_ID } from './fleet';
import { moscowDateKey } from './bookingRules';

/** The quick page on the site; the app opens its own screen for this path (push). */
export const AKTUALNO_PATH = '/provider/aktualno';

/** The weekly message (push, Telegram, e-mail through notifyUser). */
export const PRICE_ASK_TITLE = 'ИИСтройка24: обновите цены и свободные дни';
export const PRICE_ASK_BODY = 'Заказчики видят актуальную технику первой. Займёт 30 секунд.';

/** The switch in «Уведомления» (site and app). */
export const PRICE_ASK_LABEL = 'Раз в неделю напоминать обновить цены и свободные дни техники';

/**
 * The «Спрос рядом» switch next to it (lib/demandNudge.ts, same audience:
 * canAnswerPriceAsk). Kept here so the client component and the app's test
 * need no import of the notification routing.
 */
export const DEMAND_NUDGE_LABEL =
  'Спрос рядом — раз в день, если сегодня рядом есть заявки на вашу технику';

/** Not more often than this: a late Monday run still counts as the same week. */
export const PRICE_ASK_INTERVAL_MS = 6 * 86_400_000;

/** «Свободна …» is shown this long after the provider's answer, then nothing. */
export const AVAILABILITY_FRESH_DAYS = 7;
const FRESH_MS = AVAILABILITY_FRESH_DAYS * 86_400_000;

/** «Занята до …» may be set at most this far ahead. */
export const AVAILABILITY_MAX_DAYS = 90;

const DAY_MS = 86_400_000;

/** Who may answer the survey: a provider manager of a company other than the house fleet. */
export function canAnswerPriceAsk(
  user: { role?: string | null; companyId?: string | null } | null | undefined,
): user is { role: 'PROVIDER_ADMIN'; companyId: string } {
  return (
    user?.role === 'PROVIDER_ADMIN' &&
    Boolean(user.companyId) &&
    user.companyId !== HOUSE_COMPANY_ID
  );
}

/**
 * Prisma `where` of the weekly recipients among users: provider managers of
 * provider companies (not the house fleet) with at least one machine that is
 * not taken off the site. The opt-out and the once-a-week guard live in
 * NotificationSettings and are applied by lib/aktualnoData.ts.
 */
export function priceAskUsersWhere() {
  return {
    role: 'PROVIDER_ADMIN' as const,
    companyId: { not: HOUSE_COMPANY_ID },
    company: {
      isProvider: true,
      equipment: { some: { status: { not: 'RETIRED' as const } } },
    },
  };
}

/** Whether a user with this settings row gets this week's message. */
export function priceAskDue(
  settings: { priceAsk?: boolean | null; priceAskSentAt?: Date | null } | null | undefined,
  now: Date,
): boolean {
  if (settings?.priceAsk === false) return false;
  const sent = settings?.priceAskSentAt;
  return !sent || sent.getTime() <= now.getTime() - PRICE_ASK_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

/** The Moscow calendar day of an instant as UTC midnight («2026-10-20T00:00:00Z»). */
export function moscowDay(date: Date): Date {
  return new Date(`${moscowDateKey(date)}T00:00:00.000Z`);
}

/** «YYYY-MM-DD» of a stored day (UTC midnight). */
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** «20 октября» of a stored day. */
export function dayLabel(day: Date): string {
  return day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** What the provider picked for a machine. */
export type AvailabilityChoice =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  /** Busy up to and including this Moscow day («YYYY-MM-DD»): free from the next one. */
  | { kind: 'busy'; until: string };

export const AVAILABILITY_LABELS = {
  today: 'Свободна сегодня',
  tomorrow: 'Свободна с завтра',
  busy: 'Занята до…',
} as const;

/**
 * The day a choice makes the machine free from, or an error text. «Занята
 * до 20 октября» means free from 21 October; the date may not be in the past
 * or more than AVAILABILITY_MAX_DAYS ahead.
 */
export function availableFromChoice(
  choice: AvailabilityChoice,
  now: Date,
): { ok: true; day: Date } | { ok: false; error: string } {
  const today = moscowDay(now);
  if (choice.kind === 'today') return { ok: true, day: today };
  if (choice.kind === 'tomorrow') return { ok: true, day: new Date(today.getTime() + DAY_MS) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.until)) {
    return { ok: false, error: 'Укажите, до какого дня машина занята' };
  }
  const until = new Date(`${choice.until}T00:00:00.000Z`);
  if (Number.isNaN(until.getTime()) || dayKey(until) !== choice.until) {
    return { ok: false, error: 'Укажите, до какого дня машина занята' };
  }
  if (until.getTime() < today.getTime()) {
    return { ok: false, error: 'Дата «Занята до» уже прошла — выберите сегодняшнюю или позже' };
  }
  if (until.getTime() > today.getTime() + AVAILABILITY_MAX_DAYS * DAY_MS) {
    return { ok: false, error: `«Занята до» — не дальше ${AVAILABILITY_MAX_DAYS} дней вперёд` };
  }
  return { ok: true, day: new Date(until.getTime() + DAY_MS) };
}

/** The chip a stored answer comes back as (the form prefills it). */
export function choiceFromStored(
  availableFrom: Date | null | undefined,
  now: Date,
): AvailabilityChoice | null {
  if (!availableFrom) return null;
  const today = moscowDay(now).getTime();
  const from = availableFrom.getTime();
  if (from <= today) return { kind: 'today' };
  if (from === today + DAY_MS) return { kind: 'tomorrow' };
  return { kind: 'busy', until: dayKey(new Date(from - DAY_MS)) };
}

// ---------------------------------------------------------------------------
// What customers see
// ---------------------------------------------------------------------------

export interface AvailabilityFields {
  status?: string | null;
  availableFrom?: Date | string | null;
  availabilityUpdatedAt?: Date | string | null;
  companyId?: string | null;
}

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The provider confirmed prices and free days within the last 7 days. */
export function isAvailabilityFresh(item: AvailabilityFields, now: Date): boolean {
  const updated = asDate(item.availabilityUpdatedAt);
  if (!updated) return false;
  const age = now.getTime() - updated.getTime();
  return age >= -60_000 && age <= FRESH_MS;
}

/**
 * «Свободна сейчас» / «Свободна с 20 октября» on a machine card, or null:
 * only within 7 days of the provider's answer, never for a machine on repair
 * or taken off the site, and «сейчас» only while its status is «Свободна»
 * (the status the provider sets by hand wins over an older answer).
 */
export function availabilityBadge(item: AvailabilityFields, now: Date): string | null {
  if (!isAvailabilityFresh(item, now)) return null;
  if (item.status === 'IN_MAINTENANCE' || item.status === 'RETIRED') return null;
  const from = asDate(item.availableFrom);
  if (!from) return null;
  if (from.getTime() > moscowDay(now).getTime()) return `Свободна с ${dayLabel(from)}`;
  return item.status === 'AVAILABLE' || item.status == null ? 'Свободна сейчас' : null;
}

/**
 * The catalogue order with fresh answers a bit higher: СпецПласт16's fleet
 * stays first (houseFirst, unchanged), then other providers' machines whose
 * prices and free days were confirmed in the last 7 days, then the rest — each
 * group in its own order (a stable sort, applied to one page of results).
 */
export function freshFirst<T extends AvailabilityFields>(items: readonly T[], now: Date): T[] {
  const rank = (item: T) =>
    item.companyId === HOUSE_COMPANY_ID ? 2 : isAvailabilityFresh(item, now) ? 1 : 0;
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// The save request
// ---------------------------------------------------------------------------

/** One machine of «Сохранить». */
export interface AktualnoItem {
  id: string;
  /** ₽ per hour with the operator; null — no hourly price. */
  hourlyRate: number | null;
  /** ₽ per 8-hour shift. */
  dailyRate: number;
  availability: AvailabilityChoice;
}

export const MAX_AKTUALNO_ITEMS = 200;
const MAX_PRICE = 99_999_999;

function priceOf(value: unknown, label: string, optional: boolean): number | null | string {
  if ((value === null || value === undefined || value === '') && optional) return null;
  const number = typeof value === 'string' ? Number(value.replace(/\s/g, '')) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return `${label} укажите числом больше нуля`;
  }
  // Whole roubles (REVIEW.md §3); «0,4» is not a price.
  const rounded = Math.round(number);
  if (rounded <= 0) return `${label} укажите числом больше нуля`;
  if (rounded > MAX_PRICE) return `${label}: слишком большая цена`;
  return rounded;
}

/** Reads the PUT body: { items: [{ id, hourlyRate, dailyRate, availability }] }. */
export function parseAktualnoBody(
  body: unknown,
): { ok: true; items: AktualnoItem[] } | { ok: false; error: string } {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Нечего сохранять' };
  if (raw.length > MAX_AKTUALNO_ITEMS) return { ok: false, error: 'Слишком много машин за раз' };
  const items: AktualnoItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || id.length > 64 || seen.has(id)) return { ok: false, error: 'Техника не найдена' };
    seen.add(id);
    const hourly = priceOf(row.hourlyRate, 'Цену за час', true);
    if (typeof hourly === 'string') return { ok: false, error: hourly };
    const daily = priceOf(row.dailyRate, 'Цену за смену', false);
    if (typeof daily === 'string') return { ok: false, error: daily };
    if (daily === null) return { ok: false, error: 'Укажите цену за смену' };
    const availability = row.availability as Record<string, unknown> | undefined;
    let choice: AvailabilityChoice;
    if (availability?.kind === 'today') choice = { kind: 'today' };
    else if (availability?.kind === 'tomorrow') choice = { kind: 'tomorrow' };
    else if (availability?.kind === 'busy' && typeof availability.until === 'string') {
      choice = { kind: 'busy', until: availability.until };
    } else {
      return { ok: false, error: 'Отметьте, когда машина свободна' };
    }
    items.push({ id, hourlyRate: hourly, dailyRate: daily, availability: choice });
  }
  return { ok: true, items };
}
