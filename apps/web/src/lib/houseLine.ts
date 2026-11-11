// «Всегда на линии» (owner, 2026-11-11: «То, что онлайн, не онлайн, должно быть
// всегда онлайн. Любая техника… Все они должны вести ко мне, если нет других.
// Если другие есть, то честная конкуренция»). The platform never looks empty:
// СпецПласт16's own published, free machines are on the line by the owner's
// standing declaration — his dispatcher takes the calls — the same «пока не
// отключу» as LinePresence.standingForever (lib/lineStanding.ts), at the
// company's base, without GPS and without a driver.
//
// LinePresence holds one row per account (`userId` is unique), so a fleet of
// fifteen machines cannot be fifteen rows without inventing fifteen people.
// The standing rows are therefore derived when the line is read — from real
// machines and their real status — and never written: nothing to expire, to
// switch off in the evening or to repair after a deploy. Nothing is made up:
// no company, driver, position or counter that the database does not hold.
//
// What takes a house machine off the line is what the owner already does in
// /provider: «Занята» / «В ремонте» / «Снять с публикации» (any status but
// AVAILABLE). A CONFIRMED/ACTIVE booking today makes it «Занята сегодня», as
// for every provider. Other providers are not touched: their rows go through
// the same lists by the same rules.

import { HOUSE_COMPANY_ID } from './fleet';
import { basePoint, isOnLine, type PresenceRow } from './linePresence';
import { busyDays, localDayKey, type BusyBooking } from './lineStanding';
import { SITE } from './site';

/** The id of a derived row: never a LinePresence id, never an account id. */
export const HOUSE_LINE_ID_PREFIX = 'house-line-';

export interface HouseMachineRow {
  id: string;
  name: string;
  companyId: string;
  status: string;
  hourlyRate: number;
  dailyRate: number;
  categoryId?: string | null;
  category: { name: string; slug: string } | null;
  location: { latitude: number | null; longitude: number | null } | null;
  company: { baseLat: number | null; baseLon: number | null };
}

/** A house machine that is on the line by the standing declaration: published and free. */
export function houseOnLine(machine: { companyId: string; status: string }): boolean {
  return machine.companyId === HOUSE_COMPANY_ID && machine.status === 'AVAILABLE';
}

export function isHouseLineRow(row: { id: string }): boolean {
  return row.id.startsWith(HOUSE_LINE_ID_PREFIX);
}

type ExistingRow = Pick<PresenceRow, 'online' | 'updatedAt'> &
  Partial<
    Pick<PresenceRow, 'onlineSince' | 'timeZone' | 'standingUntil' | 'standingForever' | 'gpsAt'>
  > & { equipment: { id: string } | null };

/**
 * The standing rows of the house fleet, for liveMachines (lib/linePresence.ts):
 * one per free house machine that stands somewhere (its own point, else the
 * company's base) and has no real row on the line already — a manager's
 * phone with fresh GPS or his own period keeps the place it reports.
 * Idempotent: rows it made are «on the line», so a second pass adds nothing.
 */
export function houseStandingRows(
  machines: readonly HouseMachineRow[],
  existing: readonly ExistingRow[],
  now: Date = new Date(),
): PresenceRow[] {
  const taken = new Set<string>();
  for (const row of existing) {
    if (row.equipment && isOnLine(row, now)) taken.add(row.equipment.id);
  }
  const rows: PresenceRow[] = [];
  for (const machine of machines) {
    if (!houseOnLine(machine) || taken.has(machine.id)) continue;
    const point = basePoint(machine);
    if (!point) continue;
    taken.add(machine.id);
    rows.push({
      id: `${HOUSE_LINE_ID_PREFIX}${machine.id}`,
      userId: '',
      lat: point.lat,
      lon: point.lon,
      online: false,
      note: null,
      // No GPS and no session: only the standing declaration.
      updatedAt: now,
      onlineSince: null,
      timeZone: null,
      standingUntil: null,
      standingForever: true,
      gpsAt: null,
      basePoint: point,
      // The company answers, not a person: no driver's name.
      user: { name: null },
      company: { id: HOUSE_COMPANY_ID, name: SITE.name, verified: true },
      equipment: {
        id: machine.id,
        name: machine.name,
        companyId: HOUSE_COMPANY_ID,
        status: machine.status,
        hourlyRate: machine.hourlyRate,
        dailyRate: machine.dailyRate,
        category: machine.category,
      },
    });
  }
  return rows;
}

/** A house machine on the line, as the counters, the map pin and order routing need it. */
export interface HouseLineMachine {
  id: string;
  categoryId: string | null;
  /** Where it stands; null when neither the machine nor the company has a point. */
  point: { lat: number; lon: number } | null;
  /** A CONFIRMED/ACTIVE booking covers today (Moscow). */
  busyToday: boolean;
}

/**
 * The house fleet on the line now: free machines only (retired, rented and
 * machines under repair are not there), each once, with «занята сегодня» from
 * the bookings.
 */
export function houseLineMachines(
  machines: readonly Pick<
    HouseMachineRow,
    'id' | 'companyId' | 'status' | 'categoryId' | 'location' | 'company'
  >[],
  bookings: readonly BusyBooking[] = [],
  now: Date = new Date(),
): HouseLineMachine[] {
  const today = localDayKey(now, 'Europe/Moscow');
  const seen = new Set<string>();
  const result: HouseLineMachine[] = [];
  for (const machine of machines) {
    if (!houseOnLine(machine) || seen.has(machine.id)) continue;
    seen.add(machine.id);
    result.push({
      id: machine.id,
      categoryId: machine.categoryId ?? null,
      point: basePoint(machine),
      busyToday: busyDays(bookings, machine.id, today, 1)[0] === today,
    });
  }
  return result;
}

/** The ones a customer can take today: counted as «на линии» on the home page and the map pin. */
export function houseFreeNow(machines: readonly HouseLineMachine[]): HouseLineMachine[] {
  return machines.filter((machine) => !machine.busyToday);
}
