// «На линии» (owner, 2026-10-15): the machines whose manager or machinist
// went online from the app, as the customer's home map shows them. Pure
// helpers; the rows come from LinePresence (api/line, api/line/nearby).

import { HOUSE_COMPANY_ID } from './fleet';
import { distanceKm } from './geo';
import { shortAuthorName } from './comments';
import { presenceAutoOff } from './lineDay';
import { busyDays, standingActive, untilText, type BusyBooking } from './lineStanding';
import { HIDDEN_CONTACT, HIDDEN_LINK, maskContactsAndLinks } from './privacy';
import { SITE } from './site';

/**
 * A position older than this is stale: the phone went to sleep or lost the
 * net. The app sends a heartbeat at least every minute while online, so a
 * parked machine stays on the map.
 */
export const PRESENCE_FRESH_MS = 15 * 60_000;
/** The customer's map asks for machines within this many kilometres by default. */
export const NEARBY_DEFAULT_KM = 60;
export const NEARBY_MAX_KM = 300;
/** A phone reports a pure position update at most this often. */
export const PRESENCE_MIN_INTERVAL_MS = 15_000;
/** The map never gets more rows than this: the freshest ones around the point. */
export const NEARBY_MAX_ROWS = 200;
/** The machine's name in the bubble is cut after this many characters. */
export const BUBBLE_NAME_MAX = 40;

export type EquipmentStatus = 'AVAILABLE' | 'RENTED' | 'IN_MAINTENANCE' | 'RETIRED';

/** Why a machine in this status cannot go «на линии»; null when it can. */
export function machineUnavailableReason(status: EquipmentStatus | string): string | null {
  switch (status) {
    case 'AVAILABLE':
      return null;
    case 'RENTED':
      return 'Эта машина сейчас занята — отметьте её «Свободна», чтобы выйти на линию';
    case 'IN_MAINTENANCE':
      return 'Эта машина в ремонте — отметьте её «Свободна», чтобы выйти на линию';
    default:
      return 'Эта машина снята с публикации';
  }
}

/** The note is public: a phone, e-mail or link in it is refused, not masked. */
export function noteHasContacts(note: string): boolean {
  const masked = maskContactsAndLinks(note);
  return masked !== note || note.includes(HIDDEN_CONTACT) || note.includes(HIDDEN_LINK);
}

export interface PresenceRow {
  /** The presence row's own id: the one the map gets, never the driver's User.id. */
  id: string;
  userId: string;
  lat: number;
  lon: number;
  online: boolean;
  note: string | null;
  updatedAt: Date;
  /** When this session began; with `timeZone`, ends it at the evening cutoff (lib/lineDay.ts). */
  onlineSince?: Date | null;
  /** The phone's IANA time zone; Moscow when unknown. */
  timeZone?: string | null;
  /** «На линии на 5 рабочих дней» (lib/lineStanding.ts): seen until then without GPS. */
  standingUntil?: Date | null;
  standingForever?: boolean | null;
  /** The last real GPS report; updatedAt on older rows. */
  gpsAt?: Date | null;
  /** Where a machine without fresh GPS stands: its own point, else the company's base. */
  basePoint?: { lat: number; lon: number } | null;
  user: { name: string | null };
  company: { id: string; name: string; verified: boolean };
  equipment: {
    id: string;
    name: string;
    status: EquipmentStatus | string;
    hourlyRate: number;
    dailyRate: number;
    category: { name: string; slug: string } | null;
  } | null;
}

export interface LiveMachine {
  id: string;
  lat: number;
  lon: number;
  /** First name and initial, as on comments and offers. */
  driver: string;
  company: { id: string; name: string; verified: boolean; isHouse: boolean };
  equipment: {
    id: string;
    name: string;
    category: string | null;
    categorySlug: string | null;
    hourlyRate: number;
    dailyRate: number;
  } | null;
  note: string | null;
  distanceKm: number | null;
  /**
   * The bubble on the map: «Я на линии, рядом сейчас · Экскаватор JCB · от 4 000 ₽/ч · Марат Г.»
   * with fresh GPS, «Я на линии до пт · …» at the base, «Занята сегодня · …» when booked today.
   */
  bubble: string;
  updatedAt: string;
  /** The phone reports a fresh position: the pin is where the machine is now. */
  live: boolean;
  /** «до пт», «до 06.11», «до отключения»; null for a live session without a standing line. */
  until: string | null;
  /** A CONFIRMED/ACTIVE booking covers today (Moscow): shown, but as busy. */
  busyToday: boolean;
  /** The Moscow days of the next two weeks the machine is booked on («2026-10-29»). */
  busyDays: string[];
}

export function isFresh(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() <= PRESENCE_FRESH_MS;
}

type LineFields = Pick<PresenceRow, 'online' | 'updatedAt' | 'onlineSince' | 'timeZone'> &
  Partial<Pick<PresenceRow, 'standingUntil' | 'standingForever' | 'gpsAt'>>;

/**
 * The phone reports a live position now: online, fresh, and the session not
 * ended by the evening cutoff in the provider's own time zone (a phone left
 * on after 21:00 keeps sending, but that is not «рядом сейчас» any more).
 */
export function isLive(row: LineFields, now: Date = new Date()): boolean {
  return row.online && isFresh(row.gpsAt ?? row.updatedAt, now) && !presenceAutoOff(row, now);
}

/**
 * On the line now: a live GPS session, or the standing availability
 * («на 5 рабочих дней», «до …», «пока не отключу») has not run out.
 */
export function isOnLine(row: LineFields, now: Date = new Date()): boolean {
  return isLive(row, now) || standingActive(row, now);
}

/** «4 000 ₽/ч» with a no-break space; «договорная» when the machine has no price. */
export function rateText(rate: number): string {
  return rate > 0 ? `от ${Math.round(rate).toLocaleString('ru-RU')}\u00a0₽/ч` : 'цена договорная';
}

function shortName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > BUBBLE_NAME_MAX
    ? `${trimmed.slice(0, BUBBLE_NAME_MAX - 1).trimEnd()}…`
    : trimmed;
}

/**
 * The machinist's line for customers, as the map shows it: one line, and
 * never with a masked contact in it (rows written before the note was
 * checked at PUT time).
 */
export function publicNote(note: string | null | undefined): string | null {
  const line = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  const cleaned = line
    .split(HIDDEN_CONTACT)
    .join('')
    .split(HIDDEN_LINK)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,.;:·—-]+|[\s,·—-]+$/g, '')
    .trim();
  return cleaned || null;
}

/** Short on purpose: the map reads it at 360 px. The note travels separately. */
export function presenceBubble(
  row: {
    user: { name: string | null };
    equipment: { name: string; hourlyRate: number } | null;
  },
  head: string = 'Я на линии',
): string {
  const parts = [head];
  if (row.equipment) parts.push(shortName(row.equipment.name), rateText(row.equipment.hourlyRate));
  const driver = shortAuthorName(row.user.name);
  if (driver !== 'Пользователь') parts.push(driver);
  return parts.join(' · ');
}

/** The small first line of the bubble. */
export function bubbleHead(live: boolean, until: string | null, busyToday: boolean): string {
  if (busyToday) return 'Занята сегодня';
  if (live) return 'Я на линии, рядом сейчас';
  return until ? `Я на линии ${until}` : 'Я на линии';
}

/**
 * The machines on the line around a point, nearest first, free ones ahead
 * of the ones booked today, and СпецПласт16's ahead at equal distance.
 * A row counts when it is live (fresh GPS, not past the evening cutoff) or
 * its standing availability runs (lib/lineStanding.ts); a machine that is
 * not AVAILABLE (taken off publication, rented, under repair) is left out,
 * and one machine is shown once — a live row first, else the freshest. A
 * machine without fresh GPS stands at its base (`basePoint`), else at its
 * last known position. `bookings` (CONFIRMED/ACTIVE) mark the busy days.
 * Without a point every row is returned (the map centred on the city).
 */
export function liveMachines(
  rows: PresenceRow[],
  around: { lat: number; lon: number } | null,
  radiusKm: number,
  now: Date = new Date(),
  bookings: readonly BusyBooking[] = [],
): LiveMachine[] {
  const result: LiveMachine[] = [];
  const best = new Map<string, PresenceRow>();
  const score = (row: PresenceRow) =>
    (isLive(row, now) ? 1e15 : 0) + (row.gpsAt ?? row.updatedAt).getTime();
  for (const row of rows) {
    if (!row.equipment || !isOnLine(row, now)) continue;
    const seen = best.get(row.equipment.id);
    if (!seen || score(seen) < score(row)) best.set(row.equipment.id, row);
  }
  const today = localDayMsk(now);
  for (const row of best.values()) {
    // No machine (deleted after going online) or not «Свободна»: nothing to book.
    if (!row.equipment || row.equipment.status !== 'AVAILABLE') continue;
    const live = isLive(row, now);
    const point = live
      ? { lat: row.lat, lon: row.lon }
      : (row.basePoint ?? { lat: row.lat, lon: row.lon });
    const km = around ? distanceKm(around, point) : null;
    if (km !== null && km > radiusKm) continue;
    const until = untilText(row, now, row.timeZone);
    const days = busyDays(bookings, row.equipment.id, today);
    const busyToday = days[0] === today;
    result.push({
      id: row.id,
      lat: point.lat,
      lon: point.lon,
      driver: shortAuthorName(row.user.name),
      company: {
        id: row.company.id,
        name: row.company.name,
        verified: row.company.verified,
        isHouse: row.company.id === HOUSE_COMPANY_ID,
      },
      equipment: {
        id: row.equipment.id,
        name: row.equipment.name,
        category: row.equipment.category?.name ?? null,
        categorySlug: row.equipment.category?.slug ?? null,
        hourlyRate: row.equipment.hourlyRate,
        dailyRate: row.equipment.dailyRate,
      },
      note: publicNote(row.note),
      distanceKm: km === null ? null : Math.round(km * 10) / 10,
      bubble: presenceBubble(row, bubbleHead(live, until, busyToday)),
      updatedAt: (row.gpsAt ?? row.updatedAt).toISOString(),
      live,
      until,
      busyToday,
      busyDays: days,
    });
  }
  return result.sort(
    (a, b) =>
      Number(a.busyToday) - Number(b.busyToday) ||
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
      Number(b.company.isHouse) - Number(a.company.isHouse) ||
      Number(b.live) - Number(a.live) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Today's Moscow day key: bookings are dated by Moscow (REVIEW.md §5). */
function localDayMsk(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// ---------------------------------------------------------------------------
// СпецПласт16's own machines at the base (owner, 2026-10-17): the house fleet
// that is free to book is on the customer's map too, at its real base — the
// machine's own location when it has coordinates, else the company's base.
// Never «Я на линии»: that bubble belongs to a machine whose driver is
// online, and such a machine is shown as a live one instead.
// ---------------------------------------------------------------------------

/** At most this many house machines at the base go to the map (the nearest ones). */
export const NEARBY_BASE_MAX = 60;
/**
 * How many house machines the query reads before the radius and distance
 * sort pick the NEARBY_BASE_MAX nearest: the whole house fleet in practice.
 */
export const NEARBY_BASE_SCAN = 500;

export interface BaseMachineRow {
  id: string;
  name: string;
  companyId: string;
  status: EquipmentStatus | string;
  /** The customer's rates (customerRates: never below the house price list). */
  hourlyRate: number;
  dailyRate: number;
  category: { name: string; slug: string } | null;
  location: { latitude: number | null; longitude: number | null } | null;
  company: { baseLat: number | null; baseLon: number | null };
}

export interface BaseMachine {
  /** The machine's id: the map opens its page. */
  id: string;
  lat: number;
  lon: number;
  company: { name: string; isHouse: true };
  equipment: {
    id: string;
    name: string;
    category: string | null;
    categorySlug: string | null;
    hourlyRate: number;
    dailyRate: number;
  };
  /** «от 2 500 ₽/ч» or «цена договорная». */
  priceText: string;
  distanceKm: number | null;
  /** «СпецПласт16 · Экскаватор-погрузчик JCB 3CX · от 2 500 ₽/ч · на базе». */
  bubble: string;
}

export const BASE_LABEL = 'на базе';

export function baseBubble(machine: { name: string; hourlyRate: number }): string {
  return [SITE.name, shortName(machine.name), rateText(machine.hourlyRate), BASE_LABEL].join(' · ');
}

/** Where a house machine stands: its own point, else the company's base; null when neither is known. */
export function basePoint(
  row: Pick<BaseMachineRow, 'location' | 'company'>,
): { lat: number; lon: number } | null {
  const own = row.location;
  if (typeof own?.latitude === 'number' && typeof own.longitude === 'number') {
    return { lat: own.latitude, lon: own.longitude };
  }
  const baseLat = row.company?.baseLat;
  const baseLon = row.company?.baseLon;
  return typeof baseLat === 'number' && typeof baseLon === 'number'
    ? { lat: baseLat, lon: baseLon }
    : null;
}

/**
 * СпецПласт16's free machines at the base around a point: only the house
 * fleet, only AVAILABLE, not the machines already on the line (`liveIds`),
 * within the radius; nearest first, then by name. Without a point all of
 * them (the map centred on the city).
 */
export function baseMachines(
  rows: readonly BaseMachineRow[],
  liveIds: ReadonlySet<string>,
  around: { lat: number; lon: number } | null,
  radiusKm: number,
): BaseMachine[] {
  const result: BaseMachine[] = [];
  for (const row of rows) {
    if (row.companyId !== HOUSE_COMPANY_ID || row.status !== 'AVAILABLE') continue;
    if (liveIds.has(row.id)) continue;
    const point = basePoint(row);
    if (!point) continue;
    const km = around ? distanceKm(around, point) : null;
    if (km !== null && km > radiusKm) continue;
    result.push({
      id: row.id,
      lat: point.lat,
      lon: point.lon,
      company: { name: SITE.name, isHouse: true },
      equipment: {
        id: row.id,
        name: row.name,
        category: row.category?.name ?? null,
        categorySlug: row.category?.slug ?? null,
        hourlyRate: row.hourlyRate,
        dailyRate: row.dailyRate,
      },
      priceText: rateText(row.hourlyRate),
      distanceKm: km === null ? null : Math.round(km * 10) / 10,
      bubble: baseBubble(row),
    });
  }
  return result
    .sort(
      (a, b) =>
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
        a.equipment.name.localeCompare(b.equipment.name, 'ru'),
    )
    .slice(0, NEARBY_BASE_MAX);
}
