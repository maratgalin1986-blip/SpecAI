// The public board of open orders (/orders, GET /api/orders/board, the
// marketplace block on the home page). Owner's request (2026-10-11): the
// site must visibly be a marketplace, like a classifieds board. Pure
// functions only, unit-tested: what a card shows is decided here, so a phone,
// an e-mail, a customer's full name or account id never reaches a guest.
// The database query lives in lib/orderBoardData.ts.

import { bidsLeftText } from './bidWindow';
import { moscowDateKey, toBookingDay } from './bookingRules';
import { customerShortName } from './customerPrivacy';
import { pluralizeRu } from './pluralize';
import { maskContactsAndLinks } from './privacy';

export const BOARD_PAGE_SIZE = 20;
export const EXCERPT_MAX = 160;
const DAY_MS = 86_400_000;

export const BOARD_WHEN = ['all', 'today', 'tomorrow', 'soon'] as const;
export type BoardWhen = (typeof BOARD_WHEN)[number];
export const BOARD_WHEN_LABELS: Record<BoardWhen, string> = {
  all: 'Любые даты',
  today: 'Нужна сегодня',
  tomorrow: 'На завтра',
  soon: 'Сегодня и завтра',
};

export const BOARD_SORT = ['newest', 'soonest'] as const;
export type BoardSort = (typeof BOARD_SORT)[number];
export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  newest: 'Сначала новые',
  soonest: 'Сначала срочные',
};

/** The query of the board, from the page's search params or the API's URL. */
export interface BoardQuery {
  page: number;
  group: string | null;
  city: string | null;
  when: BoardWhen;
  sort: BoardSort;
}

type ParamValue = string | string[] | undefined | null;

function first(value: ParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === null ? undefined : raw;
}

/** Search params → a checked query: unknown values fall back to the defaults. */
export function parseBoardQuery(params: {
  page?: ParamValue;
  group?: ParamValue;
  city?: ParamValue;
  when?: ParamValue;
  sort?: ParamValue;
}): BoardQuery {
  const page = first(params.page);
  const group = first(params.group)?.trim().slice(0, 64) || null;
  const city = first(params.city)?.trim().replace(/\s+/g, ' ').slice(0, 60) || null;
  const when = first(params.when) as BoardWhen | undefined;
  const sort = first(params.sort) as BoardSort | undefined;
  return {
    page: page && /^\d{1,6}$/.test(page) && Number(page) >= 1 ? Number(page) : 1,
    group: group && /^[\w-]+$/.test(group) ? group : null,
    city,
    when: when && BOARD_WHEN.includes(when) ? when : 'all',
    sort: sort && BOARD_SORT.includes(sort) ? sort : 'newest',
  };
}

/** The board's link for a query; defaults are left out so /orders stays clean. */
export function boardHref(query: Partial<BoardQuery>, basePath = '/orders'): string {
  const params = new URLSearchParams();
  if (query.group) params.set('group', query.group);
  if (query.city) params.set('city', query.city);
  if (query.when && query.when !== 'all') params.set('when', query.when);
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const text = params.toString();
  return text ? `${basePath}?${text}` : basePath;
}

/**
 * The start-date window of a `when` filter, in the order's date space (UTC
 * midnight of the Moscow day, see lib/bookingRules.ts). `today` includes
 * overdue orders that are still open.
 */
export function whenWindow(when: BoardWhen, now: Date = new Date()): { lt?: Date; gte?: Date } {
  const today = toBookingDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const dayAfter = new Date(today.getTime() + 2 * DAY_MS);
  switch (when) {
    case 'today':
      return { lt: tomorrow };
    case 'tomorrow':
      return { gte: tomorrow, lt: dayAfter };
    case 'soon':
      return { lt: dayAfter };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Category groups: the board filters by a group («Землеройная»), not by one of
// dozens of categories. The tree is being rebuilt by another session, so this
// takes whatever shape it finds: a parent category when there is one, else the
// caller's fallback (lib/equipmentCatalog.ts task groups).
// ---------------------------------------------------------------------------

export interface CategoryRow {
  id: string;
  name: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
}

export interface CategoryGroup {
  id: string;
  label: string;
  categoryIds: string[];
}

export function groupCategories(
  rows: readonly CategoryRow[],
  fallback: (name: string) => { id: string; label: string },
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  const parents = new Set(rows.filter((row) => row.parentId).map((row) => row.parentId));
  for (const row of rows) {
    // A parent category is a group itself, not a member of one.
    if (parents.has(row.id)) continue;
    const key = row.parent
      ? { id: row.parent.id, label: row.parent.name }
      : row.parentId
        ? {
            id: row.parentId,
            label:
              rows.find((other) => other.id === row.parentId)?.name ?? fallback(row.name).label,
          }
        : fallback(row.name);
    const group = groups.get(key.id) ?? { id: key.id, label: key.label, categoryIds: [] };
    group.categoryIds.push(row.id);
    groups.set(key.id, group);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** What the query selects for one order (lib/orderBoardData.ts). */
export interface BoardOrderRow {
  id: string;
  description: string;
  desiredStartDate: Date;
  desiredEndDate: Date;
  createdAt: Date;
  bidsUntil: Date | null;
  source: string;
  category: { id: string; name: string } | null;
  customer: { name: string };
  /** The author of a chat or guest order (no account); shortened like a customer. */
  contactName?: string | null;
  location: { city: string | null } | null;
  bidCount: number;
}

/** One card of the board: safe for a guest, nothing personal. */
export interface BoardCard {
  id: string;
  href: string;
  emoji: string;
  categoryId: string | null;
  categoryName: string;
  place: string;
  /** «12–14 окт» or «12 окт». */
  dates: string;
  /** «3 дня». */
  daysLabel: string;
  /** The work starts today (or should have): «нужна сейчас». */
  urgent: boolean;
  /** «2 ч назад». */
  createdAgo: string;
  bidCount: number;
  /** «3 предложения» / «Пока без предложений». */
  bidsLabel: string;
  /** «осталось 1 ч 20 мин» while providers may still bid. */
  bidsLeft: string | null;
  /** «Анна П.» */
  customer: string;
  /** «из Telegram-чата» for imported orders, null for the site's own. */
  sourceLabel: string | null;
  /** The description, contacts and links hidden, at most EXCERPT_MAX characters. */
  excerpt: string;
}

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/автовышк|вышк|подъ[её]мник/i, '🪜'],
  [/кран|манипулятор|кму/i, '🏗️'],
  [/самосв[ао]л|грузов|тягач|трал|шаланд|эвакуатор|длинномер/i, '🚛'],
  [/бетон|миксер|раствор/i, '🧱'],
  [/ямобур|бур/i, '🕳️'],
  [/каток|асфальт/i, '🛣️'],
  [/экскаватор|погрузчик|бульдозер|грейдер|трактор|jcb|мини/i, '🚜'],
  [/генератор|компрессор|электро/i, '⚡'],
  [/вакуум|илосос|ассениз|водовоз|цистерн|поливо/i, '💧'],
];

/** An emoji for a category name; a wrench for anything unknown or «любая». */
export function categoryEmoji(name: string | null | undefined): string {
  if (!name) return '🛠️';
  return CATEGORY_EMOJI.find(([pattern]) => pattern.test(name))?.[1] ?? '🛠️';
}

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** «12 окт» for the Moscow day of an instant. */
export function shortDate(date: Date): string {
  const [, month, day] = moscowDateKey(date).split('-');
  return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1]}`;
}

/** «12–14 окт», «30 сен – 2 окт» or «12 окт» for one day. */
export function dateRangeLabel(start: Date, end: Date): string {
  const startKey = moscowDateKey(start);
  const endKey = moscowDateKey(end);
  if (endKey <= startKey) return shortDate(start);
  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
  return sameMonth
    ? `${Number(startKey.slice(8))}–${shortDate(end)}`
    : `${shortDate(start)} – ${shortDate(end)}`;
}

/** Calendar days of the work, inclusive; never less than one. */
export function daysCount(start: Date, end: Date): number {
  const from = toBookingDay(start).getTime();
  const to = toBookingDay(end).getTime();
  return Math.max(1, Math.round((to - from) / DAY_MS) + 1);
}

/** «только что», «5 мин назад», «2 ч назад», «вчера», «3 дн назад». */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} дн назад`;
  return shortDate(date);
}

/** Contacts and links hidden, whitespace folded, cut at `max` with an ellipsis. */
export function excerpt(text: string, max = EXCERPT_MAX): string {
  const clean = maskContactsAndLinks(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function bidsLabel(count: number): string {
  return count > 0
    ? pluralizeRu(count, ['предложение', 'предложения', 'предложений'])
    : 'Пока без предложений';
}

export function sourceLabel(source: string): string | null {
  if (source === 'TELEGRAM') return 'из Telegram-чата';
  if (source === 'WHATSAPP') return 'из WhatsApp-чата';
  if (source === 'OTHER') return 'из чата';
  return null;
}

/** Whether the work starts today in Moscow or is already overdue. */
export function isUrgent(desiredStartDate: Date, now: Date = new Date()): boolean {
  return toBookingDay(desiredStartDate).getTime() <= toBookingDay(now).getTime();
}

export const ANY_CATEGORY = 'Любая техника';
// An order whose place is unknown: no default region (the platform serves all of Russia).
export const DEFAULT_PLACE = 'Место не указано';

/** One row → one card. Only the fields listed here leave the server. */
export function toBoardCard(row: BoardOrderRow, now: Date = new Date()): BoardCard {
  const days = daysCount(row.desiredStartDate, row.desiredEndDate);
  const author = row.contactName?.trim() ? row.contactName : row.customer.name;
  return {
    id: row.id,
    href: `/orders/${encodeURIComponent(row.id)}`,
    emoji: categoryEmoji(row.category?.name),
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? ANY_CATEGORY,
    place: row.location?.city?.trim() || DEFAULT_PLACE,
    dates: dateRangeLabel(row.desiredStartDate, row.desiredEndDate),
    daysLabel: pluralizeRu(days, ['день', 'дня', 'дней']),
    urgent: isUrgent(row.desiredStartDate, now),
    createdAgo: timeAgo(row.createdAt, now),
    bidCount: Math.max(0, row.bidCount),
    bidsLabel: bidsLabel(row.bidCount),
    bidsLeft: bidsLeftText(row.bidsUntil, now),
    customer: customerShortName(author),
    sourceLabel: sourceLabel(row.source),
    excerpt: excerpt(row.description),
  };
}

/** The sign-in link for a guest who wants to bid: back to the order afterwards. */
export function bidLoginHref(orderId: string): string {
  return `/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}`)}`;
}

export const BID_NEEDS_PROVIDER_NOTE = 'Нужен аккаунт исполнителя';
