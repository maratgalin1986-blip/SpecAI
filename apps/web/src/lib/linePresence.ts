// «На линии» (owner, 2026-10-15): the machines whose manager or machinist
// went online from the app, as the customer's home map shows them. Pure
// helpers; the rows come from LinePresence (api/line, api/line/nearby).

import { HOUSE_COMPANY_ID } from './fleet';
import { distanceKm } from './geo';
import { shortAuthorName } from './comments';
import { HIDDEN_CONTACT, HIDDEN_LINK, maskContactsAndLinks } from './privacy';

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
  /** The bubble on the map: «Я на линии · Экскаватор JCB · от 4 000 ₽/ч · Марат Г.». */
  bubble: string;
  updatedAt: string;
}

export function isFresh(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() <= PRESENCE_FRESH_MS;
}

/** «4 000 ₽/ч» with a no-break space; «договорная» when the machine has no price. */
function rateText(rate: number): string {
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
export function presenceBubble(row: {
  user: { name: string | null };
  equipment: { name: string; hourlyRate: number } | null;
}): string {
  const parts = ['Я на линии'];
  if (row.equipment) parts.push(shortName(row.equipment.name), rateText(row.equipment.hourlyRate));
  const driver = shortAuthorName(row.user.name);
  if (driver !== 'Пользователь') parts.push(driver);
  return parts.join(' · ');
}

/**
 * The online machines around a point, nearest first and СпецПласт16's ahead
 * at equal distance; stale rows, machines that are not AVAILABLE (taken off
 * publication, rented, under repair) are left out, and one machine is shown
 * once — at its freshest position. Without a point every fresh row is
 * returned (the map centred on the city).
 */
export function liveMachines(
  rows: PresenceRow[],
  around: { lat: number; lon: number } | null,
  radiusKm: number,
  now: Date = new Date(),
): LiveMachine[] {
  const result: LiveMachine[] = [];
  const freshest = new Map<string, Date>();
  for (const row of rows) {
    if (row.equipment && row.online && isFresh(row.updatedAt, now)) {
      const seen = freshest.get(row.equipment.id);
      if (!seen || seen < row.updatedAt) freshest.set(row.equipment.id, row.updatedAt);
    }
  }
  const shown = new Set<string>();
  for (const row of rows) {
    if (!row.online || !isFresh(row.updatedAt, now)) continue;
    // No machine (deleted after going online) or not «Свободна»: nothing to book.
    if (!row.equipment || row.equipment.status !== 'AVAILABLE') continue;
    if (freshest.get(row.equipment.id) !== row.updatedAt || shown.has(row.equipment.id)) continue;
    shown.add(row.equipment.id);
    const km = around ? distanceKm(around, { lat: row.lat, lon: row.lon }) : null;
    if (km !== null && km > radiusKm) continue;
    result.push({
      id: row.id,
      lat: row.lat,
      lon: row.lon,
      driver: shortAuthorName(row.user.name),
      company: {
        id: row.company.id,
        name: row.company.name,
        verified: row.company.verified,
        isHouse: row.company.id === HOUSE_COMPANY_ID,
      },
      equipment: row.equipment
        ? {
            id: row.equipment.id,
            name: row.equipment.name,
            category: row.equipment.category?.name ?? null,
            categorySlug: row.equipment.category?.slug ?? null,
            hourlyRate: row.equipment.hourlyRate,
            dailyRate: row.equipment.dailyRate,
          }
        : null,
      note: publicNote(row.note),
      distanceKm: km === null ? null : Math.round(km * 10) / 10,
      bubble: presenceBubble(row),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return result.sort(
    (a, b) =>
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
      Number(b.company.isHouse) - Number(a.company.isHouse) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}
