// «На линии» (owner, 2026-10-15): the machines whose manager or machinist
// went online from the app, as the customer's home map shows them. Pure
// helpers; the rows come from LinePresence (api/line, api/line/nearby).

import { HOUSE_COMPANY_ID } from './fleet';
import { distanceKm } from './geo';
import { shortAuthorName } from './comments';

/** A position older than this is stale: the phone went to sleep or lost the net. */
export const PRESENCE_FRESH_MS = 15 * 60_000;
/** The customer's map asks for machines within this many kilometres by default. */
export const NEARBY_DEFAULT_KM = 60;
export const NEARBY_MAX_KM = 300;
/** A phone reports its position at most this often. */
export const PRESENCE_MIN_INTERVAL_MS = 15_000;

export interface PresenceRow {
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
  /** The bubble on the map: «Я на линии · Экскаватор JCB · от 4 000 ₽/ч · Марат». */
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

export function presenceBubble(row: {
  user: { name: string | null };
  equipment: { name: string; hourlyRate: number } | null;
  note: string | null;
}): string {
  const parts = ['Я на линии'];
  if (row.equipment) parts.push(row.equipment.name, rateText(row.equipment.hourlyRate));
  const driver = shortAuthorName(row.user.name);
  if (driver !== 'Пользователь') parts.push(driver);
  if (row.note?.trim()) parts.push(row.note.trim());
  return parts.join(' · ');
}

/**
 * The online machines around a point, nearest first and СпецПласт16's ahead
 * at equal distance; stale rows are left out. Without a point every fresh
 * row is returned (the map centred on the city).
 */
export function liveMachines(
  rows: PresenceRow[],
  around: { lat: number; lon: number } | null,
  radiusKm: number,
  now: Date = new Date(),
): LiveMachine[] {
  const result: LiveMachine[] = [];
  for (const row of rows) {
    if (!row.online || !isFresh(row.updatedAt, now)) continue;
    const km = around ? distanceKm(around, { lat: row.lat, lon: row.lon }) : null;
    if (km !== null && km > radiusKm) continue;
    result.push({
      id: row.userId,
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
      note: row.note?.trim() || null,
      distanceKm: km === null ? null : Math.round(km * 10) / 10,
      bubble: presenceBubble(row),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return result.sort(
    (a, b) =>
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
      Number(b.company.isHouse) - Number(a.company.isHouse),
  );
}
