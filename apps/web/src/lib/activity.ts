// «Сейчас на площадке»: what really happened on the platform today, for the
// app's home strip, the provider feed header and the site's home page
// (GET /api/activity). Pure: the rows come from lib/activityData.ts.
//
// Only real events and real counts — nothing is made up or rounded up. An
// event is anonymous: the machine type, a city and a relative time. Never a
// name, phone, address, price of a bid or a company name, except СпецПласт16
// (the platform's own fleet). The city is any city of Russia, but only a
// normalised name: a known city (lib/geo.ts KNOWN_CITIES) or the geocoder's
// city of an address — never the text people typed.

import { cityByName } from '@specai/shared';
import { HOUSE_COMPANY_ID } from './fleet';
import { cityInText, nearestCity } from './geo';
import { isFresh } from './linePresence';
import { sourceLabel, timeAgo } from './orderBoard';
import { pluralizeRu } from './pluralize';
import { todayStartMsk } from './providerFeed';
import { SITE } from './site';

/** The list under the strip: at most this many events. */
export const ACTIVITY_EVENTS_MAX = 8;
/** Events older than this are not shown, however quiet the day is. */
export const ACTIVITY_WINDOW_MS = 7 * 86_400_000;
/** The API and the home page block are cached this long (seconds). */
export const ACTIVITY_REVALIDATE_S = 60;
/**
 * Orders that count: published ones. A chat order waiting for the admin
 * (PENDING_REVIEW) and a cancelled or erased one (CANCELLED) do not.
 */
export const COUNTED_ORDER_STATUSES = ['OPEN', 'MATCHED'] as const;
/** A booking still counts as confirmed after it started or finished. */
export const COUNTED_BOOKING_STATUSES = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

export interface ActivityOrderRow {
  createdAt: Date;
  status: string;
  source: string;
  category: { name: string } | null;
  location: { city: string | null; latitude: number | null; longitude: number | null } | null;
}

export interface ActivityLineRow {
  online: boolean;
  onlineSince: Date | null;
  updatedAt: Date;
  lat: number;
  lon: number;
  companyId: string;
  equipment: { id: string; status: string; category: { name: string } | null } | null;
}

export interface ActivityBookingRow {
  status: string;
  confirmedAt: Date | null;
  equipment: { companyId: string; category: { name: string } | null };
}

export interface ActivityToday {
  /** New published orders since Moscow midnight, chat imports included. */
  orders: number;
  /** Machines on the line right now (fresh position, AVAILABLE). */
  online: number;
  /** Bookings confirmed since Moscow midnight. */
  confirmed: number;
}

export interface ActivityEvent {
  kind: 'order' | 'line' | 'booking';
  /** «Новая заявка: самосвалы, Елабуга». */
  text: string;
  /** «12 мин назад». */
  ago: string;
  at: string;
}

export interface Activity {
  today: ActivityToday;
  /** «Сегодня: 14 заявок · 3 машины на линии», or a neutral line at zero. */
  summary: string;
  events: ActivityEvent[];
  updatedAt: string;
}

/** «Самосвалы» → «самосвалы»; an abbreviation («КМУ») keeps its case. */
export function categoryWord(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (/^\p{Lu}{2}/u.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** A city name as the geocoder writes it: letters, spaces and hyphens only. */
const CITY_NAME = /^[А-ЯЁ][а-яё]+(?:[ -][А-ЯЁа-яё][а-яё]+){0,3}$/u;

/**
 * The city of a place, else null: a known city named in Location.city; the
 * geocoder's city when the place was geocoded (it has coordinates, so the
 * city came from Nominatim or Photon, not from the visitor); else the nearest
 * known city within 40 km. A street, a house number or free text never leave
 * the server. A geocoded village name is shown too: it is the same
 * Location.city the public order board (lib/orderBoard.ts) already shows.
 */
export function publicCity(
  place:
    | { city?: string | null; latitude?: number | null; longitude?: number | null }
    | null
    | undefined,
): string | null {
  if (!place) return null;
  const named = cityByName(place.city) ?? cityInText(place.city);
  if (named) return named.name;
  if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
    const geocoded = place.city?.trim() ?? '';
    if (geocoded.length <= 40 && CITY_NAME.test(geocoded)) return geocoded;
    return nearestCity(place.latitude, place.longitude, 40)?.name ?? null;
  }
  return null;
}

export function orderEventText(row: ActivityOrderRow): string {
  const what = categoryWord(row.category?.name);
  const city = publicCity(row.location);
  const tail = [what, city].filter(Boolean).join(', ');
  // The board's own rule for imported orders (any chat source).
  const head = sourceLabel(row.source) !== null ? 'Новая заявка из чата' : 'Новая заявка';
  return tail ? `${head}: ${tail}` : head;
}

export function lineEventText(row: ActivityLineRow): string {
  const what = categoryWord(row.equipment?.category?.name);
  const city = nearestCity(row.lat, row.lon, 40)?.name ?? null;
  const head =
    row.companyId === HOUSE_COMPANY_ID
      ? `Машина ${SITE.name} вышла на линию`
      : 'Машина вышла на линию';
  const body = [what, city].filter(Boolean).join(' · ');
  return body ? `${head}: ${body}` : head;
}

export function bookingEventText(row: ActivityBookingRow): string {
  const what = categoryWord(row.equipment.category?.name);
  const house = row.equipment.companyId === HOUSE_COMPANY_ID ? ` · парк ${SITE.name}` : '';
  return what ? `Бронь подтверждена: ${what}${house}` : `Бронь подтверждена${house}`;
}

/** A machine really on the line now: online, fresh and free to book. */
export function isLiveLine(row: ActivityLineRow, now: Date): boolean {
  return row.online && isFresh(row.updatedAt, now) && row.equipment?.status === 'AVAILABLE';
}

/** Machines on the line now, each machine once. */
export function onlineCount(rows: readonly ActivityLineRow[], now: Date): number {
  const ids = new Set<string>();
  for (const row of rows) if (isLiveLine(row, now) && row.equipment) ids.add(row.equipment.id);
  return ids.size;
}

/**
 * The newest events of the last ACTIVITY_WINDOW_MS, newest first. Rows are
 * checked again here (status, time window, a machine still on the line), so a query that
 * let a PENDING_REVIEW or CANCELLED order through still shows nothing of it.
 */
export function activityEvents(
  rows: {
    orders: readonly ActivityOrderRow[];
    line: readonly ActivityLineRow[];
    bookings: readonly ActivityBookingRow[];
  },
  now: Date = new Date(),
): ActivityEvent[] {
  const since = now.getTime() - ACTIVITY_WINDOW_MS;
  const inWindow = (date: Date | null): date is Date =>
    date !== null && date.getTime() >= since && date.getTime() <= now.getTime() + 60_000;
  const events: { kind: ActivityEvent['kind']; text: string; at: Date }[] = [];
  for (const row of rows.orders) {
    if (!(COUNTED_ORDER_STATUSES as readonly string[]).includes(row.status)) continue;
    if (!inWindow(row.createdAt)) continue;
    events.push({ kind: 'order', text: orderEventText(row), at: row.createdAt });
  }
  const seenMachines = new Set<string>();
  for (const row of rows.line) {
    // Only machines still on the line: the event never points at a machine
    // that has gone, nor at where it stood afterwards.
    if (!isLiveLine(row, now) || !row.equipment || seenMachines.has(row.equipment.id)) continue;
    if (!inWindow(row.onlineSince)) continue;
    seenMachines.add(row.equipment.id);
    events.push({ kind: 'line', text: lineEventText(row), at: row.onlineSince });
  }
  for (const row of rows.bookings) {
    if (!(COUNTED_BOOKING_STATUSES as readonly string[]).includes(row.status)) continue;
    if (!inWindow(row.confirmedAt)) continue;
    events.push({ kind: 'booking', text: bookingEventText(row), at: row.confirmedAt });
  }
  return events
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, ACTIVITY_EVENTS_MAX)
    .map((event) => ({
      kind: event.kind,
      text: event.text,
      ago: timeAgo(event.at, now),
      at: event.at.toISOString(),
    }));
}

/** «Сегодня: 14 заявок · 3 машины на линии · 2 брони подтверждены»; zeros are left out. */
export function activitySummary(today: ActivityToday): string {
  const parts: string[] = [];
  if (today.orders > 0) parts.push(pluralizeRu(today.orders, ['заявка', 'заявки', 'заявок']));
  if (today.online > 0) {
    parts.push(`${pluralizeRu(today.online, ['машина', 'машины', 'машин'])} на линии`);
  }
  if (today.confirmed > 0) {
    parts.push(
      `${pluralizeRu(today.confirmed, ['бронь подтверждена', 'брони подтверждены', 'броней подтверждено'])}`,
    );
  }
  return parts.length > 0 ? `Сегодня: ${parts.join(' · ')}` : 'Сегодня новых заявок пока нет';
}

/** Moscow midnight of today: where «сегодня» starts for the counters. */
export function activityDayStart(now: Date = new Date()): Date {
  return todayStartMsk(now);
}

export function buildActivity(
  today: ActivityToday,
  rows: Parameters<typeof activityEvents>[0],
  now: Date = new Date(),
): Activity {
  return {
    today,
    summary: activitySummary(today),
    events: activityEvents(rows, now),
    updatedAt: now.toISOString(),
  };
}
