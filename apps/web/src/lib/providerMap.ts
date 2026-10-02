// The providers map (/map, GET /api/providers/map) and the provider's own
// pin (PATCH /api/companies/me): where a fleet is based, its marker picture
// and a short note. Pure functions only, so they are unit-tested without a
// database and can be imported by client components.

import { HOUSE_COMPANY_ID } from './fleet';
import { inServiceArea } from './geo';
import { maskContacts } from './privacy';
import { pluralizeRu } from './pluralize';
import { MACHINE_TYPES, photosOf } from './machinePhotos';

export const PIN_NOTE_MAX = 120;

/** Hints under the note field: what customers find useful on the map. */
export const PIN_NOTE_EXAMPLES = [
  'от 2 500 ₽/ч, скидка 10% от недели',
  'Работаем без выходных, подача за 2 часа',
  'Подача по Челнам бесплатно',
  'Опытные машинисты, документы для юрлиц',
] as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const BASE_REQUIRED_MESSAGE =
  'Укажите, где стоит техника: адрес базы или точку на карте — по ней вас найдут заказчики';
export const BASE_OUTSIDE_MESSAGE =
  'Точка базы должна быть в Татарстане или соседних регионах — проверьте адрес или точку на карте';
export const PIN_NOTE_CONTACTS_MESSAGE =
  'В подписи не указывайте телефон, e-mail и ссылки: заказчики связываются через заявку на сайте';

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Whether a request carries a point at all (both coordinates present). */
export function hasCoords(lat: unknown, lon: unknown): boolean {
  return toNumber(lat) !== null && toNumber(lon) !== null;
}

/**
 * A provider's base: both coordinates as numbers (or numeric strings), inside
 * Tatarstan and the neighbouring regions, rounded to six decimals (~10 cm).
 */
export function parseBaseCoords(lat: unknown, lon: unknown): Checked<{ lat: number; lon: number }> {
  const la = toNumber(lat);
  const lo = toNumber(lon);
  if (la === null || lo === null) return { ok: false, error: BASE_REQUIRED_MESSAGE };
  if (la < -90 || la > 90 || lo < -180 || lo > 180 || !inServiceArea(la, lo)) {
    return { ok: false, error: BASE_OUTSIDE_MESSAGE };
  }
  return { ok: true, value: { lat: round(la, 6), lon: round(lo, 6) } };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
const LINK =
  /(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}-]+\.(?:ru|рф|com|net|org|su|info|online|site)(?![\p{L}\p{N}])/iu;

/**
 * The note under a provider's marker: plain text on one line, at most
 * PIN_NOTE_MAX characters, without tags, invisible characters or contacts
 * (customers reach providers through orders, not directly). Empty → null.
 */
export function sanitizePinNote(input: unknown): Checked<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, error: 'Подпись должна быть текстом' };
  const text = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { ok: true, value: null };
  if (text.length > PIN_NOTE_MAX) {
    return { ok: false, error: `Подпись — не длиннее ${PIN_NOTE_MAX} символов` };
  }
  if (maskContacts(text) !== text || LINK.test(text)) {
    return { ok: false, error: PIN_NOTE_CONTACTS_MESSAGE };
  }
  return { ok: true, value: text };
}

/** Where /api/uploads puts a provider's files on Vercel Blob. */
function isOwnUpload(url: URL, companyId: string) {
  return (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.public.blob.vercel-storage.com') &&
    url.pathname.startsWith(`/equipment/${companyId}/`)
  );
}

/** The site's own machine photos (/images/machines/…): СпецПласт16 may use them as its marker. */
export function siteMachinePhotos(): string[] {
  return [...new Set(MACHINE_TYPES.flatMap((type) => photosOf(type)))];
}

/** Pictures a company can pick for its marker: its machinery's photos, plus the site's for the own fleet. */
export function pinPhotoChoices(companyId: string, ownImageUrls: readonly string[]): string[] {
  const own = [...new Set(ownImageUrls)].filter(isDisplayableImage).slice(0, 40);
  return companyId === HOUSE_COMPANY_ID
    ? [...own, ...siteMachinePhotos().filter((src) => !own.includes(src))]
    : own;
}

/**
 * The marker picture a provider may choose: a photo of its own machinery
 * (one of its equipment's imageUrls) or a file it uploaded itself; the own
 * fleet (СпецПласт16) may also use the site's machine photos. Anything else
 * (someone else's photo, an arbitrary site) is refused.
 */
export function isAllowedPinImage(
  value: string,
  owner: { companyId: string; ownImageUrls: readonly string[] },
): boolean {
  if (!value || value.length > 1000) return false;
  if (owner.ownImageUrls.includes(value)) return isDisplayableImage(value);
  if (owner.companyId === HOUSE_COMPANY_ID && siteMachinePhotos().includes(value)) return true;
  try {
    return isOwnUpload(new URL(value), owner.companyId);
  } catch {
    return false;
  }
}

/** An https URL or a path on this site — never javascript:, data: or //host. */
export function isDisplayableImage(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The fields the map reads from a Company (plus whatever else a query returns). */
export interface ProviderMapRow {
  id: string;
  name: string;
  isProvider?: boolean;
  baseLat: number | null;
  baseLon: number | null;
  pinImageUrl: string | null;
  pinNote: string | null;
  equipmentCount: number;
}

/** One marker on the public map: nothing personal, no phones or e-mails. */
export interface ProviderMapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  note: string | null;
  imageUrl: string | null;
  equipmentCount: number;
  isHouse: boolean;
  catalogUrl: string;
}

/**
 * The public map's markers. Fields are copied one by one, so a phone, an
 * e-mail, an address or a user that a query happens to include never reaches
 * the response. Companies without published machinery, without a base (or
 * outside the area) are skipped;
 * coordinates are rounded to four decimals (~10 m).
 */
export function toMapPins(rows: readonly ProviderMapRow[]): ProviderMapPin[] {
  const pins: ProviderMapPin[] = [];
  for (const row of rows) {
    if (row.isProvider === false) continue;
    // Nothing published (no machinery, or all of it taken off the site): not on the map.
    if (row.equipmentCount < 1) continue;
    if (row.baseLat === null || row.baseLon === null) continue;
    if (!inServiceArea(row.baseLat, row.baseLon)) continue;
    const note = sanitizePinNote(row.pinNote);
    pins.push({
      id: row.id,
      name: row.name.trim().slice(0, 120),
      lat: round(row.baseLat, 4),
      lon: round(row.baseLon, 4),
      note: note.ok ? note.value : null,
      imageUrl: isDisplayableImage(row.pinImageUrl) ? row.pinImageUrl : null,
      equipmentCount: Math.max(0, Math.floor(row.equipmentCount)),
      isHouse: row.id === HOUSE_COMPANY_ID,
      catalogUrl: `/equipment?company=${encodeURIComponent(row.id)}`,
    });
  }
  // The own fleet first, then the providers with the most machinery.
  return pins.sort(
    (a, b) =>
      Number(b.isHouse) - Number(a.isHouse) ||
      b.equipmentCount - a.equipmentCount ||
      a.name.localeCompare(b.name, 'ru'),
  );
}

/**
 * The base picker after the address field changed: a point that was found for
 * another address (`foundFor`) is dropped, so the old point is never saved
 * with a new address; a point placed by hand (`foundFor` null) stays.
 */
export function baseAfterAddressEdit<
  T extends { address: string; lat: number | null; lon: number | null },
>(value: T, address: string, foundFor: string | null): T {
  if (foundFor !== null && address.trim() !== foundFor) {
    return { ...value, address, lat: null, lon: null };
  }
  return { ...value, address };
}

/** «3 единицы техники». */
export function machineCountLabel(count: number): string {
  return `${pluralizeRu(count, ['единица', 'единицы', 'единиц'])} техники`;
}

/**
 * Markers that would overlap on screen (closer than `minDistance` pixels) are
 * spread on a small circle around their common centre, so every provider
 * stays tappable («spiderfy» without a plugin). Takes screen positions in
 * pixels and returns the shift for each id (0, 0 for markers left in place).
 */
export function spreadOverlapping(
  points: readonly { id: string; x: number; y: number }[],
  minDistance = 44,
  radius = 34,
): Map<string, { dx: number; dy: number }> {
  const shifts = new Map<string, { dx: number; dy: number }>();
  const groups: { id: string; x: number; y: number }[][] = [];
  for (const point of points) {
    const group = groups.find((members) =>
      members.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < minDistance),
    );
    if (group) group.push(point);
    else groups.push([point]);
  }
  for (const group of groups) {
    if (group.length === 1) {
      shifts.set(group[0]!.id, { dx: 0, dy: 0 });
      continue;
    }
    const cx = group.reduce((sum, point) => sum + point.x, 0) / group.length;
    const cy = group.reduce((sum, point) => sum + point.y, 0) / group.length;
    const ring = Math.max(radius, (group.length * minDistance) / (2 * Math.PI));
    group.forEach((point, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / group.length;
      shifts.set(point.id, {
        dx: Math.round(cx + ring * Math.cos(angle) - point.x),
        dy: Math.round(cy + ring * Math.sin(angle) - point.y),
      });
    });
  }
  return shifts;
}
