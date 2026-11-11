// The providers map (/map, GET /api/providers/map) and the provider's own
// pin (PATCH /api/companies/me): where a fleet is based, its marker picture
// and a short note. Pure functions only, so they are unit-tested without a
// database and can be imported by client components.

import { HOUSE_COMPANY_ID } from './fleet';
import { cityInText, distanceKm, inServiceArea, nearestCity } from './geo';
import { maskContacts } from './privacy';
import { pluralizeRu } from './pluralize';
import { MACHINE_TYPES, photosOf } from './machinePhotos';
import { providerPath } from './providerSeo';
import { SITE } from './site';
import { storedKeyFromUrl } from './fileUrls';

export const PIN_NOTE_MAX = 120;

/** Hints under the note field: what customers find useful on the map. */
export const PIN_NOTE_EXAMPLES = [
  'от 2 500 ₽/ч, скидка 10% от недели',
  'Работаем без выходных, подача за 2 часа',
  'Подача по городу бесплатно',
  'Опытные машинисты, документы для юрлиц',
] as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const BASE_REQUIRED_MESSAGE =
  'Укажите, где стоит техника: адрес базы или точку на карте — по ней вас найдут заказчики';
export const BASE_OUTSIDE_MESSAGE =
  'Точка базы должна быть в России — проверьте адрес или точку на карте';
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
 * Russia (a rough box), rounded to six decimals (~10 cm).
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

/** Where /api/uploads puts a provider's files: Vercel Blob or the site's own store. */
function isOwnUpload(url: URL, companyId: string) {
  const stored = storedKeyFromUrl(url.href);
  if (stored) return stored.startsWith(`equipment/${companyId}/`);
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
/** A published machine of the company, as the pin lists it (customer rates, lib/equipmentCatalog.ts). */
export interface MapMachineRow {
  name: string;
  /** The category's name; the machine's own name when it has none. */
  category: string | null;
  /** The customer's price of a shift, 0 when not set. */
  dailyRate: number;
  /** The machine's own point, when it has one: a base for a company without `baseLat`. */
  location?: { latitude: number | null; longitude: number | null } | null;
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
  // «Все видят всех» (owner, 2026-11-08): the provider's own switches, null = on.
  showOnMap?: boolean | null;
  showPhoneOnMap?: boolean | null;
  /** The company's contact phone; on the pin while showPhoneOnMap is on. */
  phone?: string | null;
  /** Only its city reaches the map, never the address itself. */
  baseAddress?: string | null;
  machines?: readonly MapMachineRow[];
  /** A machine of the company is «на линии» right now (lib/linePresence.ts isOnLine). */
  onLine?: boolean;
}

/** How many machinery types the pin names before «ещё N». */
export const PIN_TYPES_MAX = 3;

/**
 * One marker on the public map. Personal data: only the company's own
 * contact phone, and only while its «Показывать телефон на карте» is on;
 * never an e-mail, an address or a person.
 */
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
  /** Distinct machinery types, at most PIN_TYPES_MAX («Экскаваторы», «Самосвалы»). */
  machines: string[];
  /** How many more types the company has. */
  machinesMore: number;
  /** The city or town of the base («Набережные Челны»), null when unknown. */
  city: string | null;
  /** «от 24 000 ₽/смена» from the cheapest priced machine; null without prices. */
  priceText: string | null;
  /** «+7 927 242-80-88» or null (hidden by the provider, or no phone). */
  phone: string | null;
  /** «tel:+79272428088» for a tap-to-call link; null with `phone`. */
  phoneHref: string | null;
  /** On the line now: the pin is highlighted; offline pins are dimmed, never hidden. */
  onLine: boolean;
  /** «Написать»: an order addressed to this provider. */
  orderUrl: string;
}

/** The order form addressed to one provider (the same link as on its page). */
export function providerOrderUrl(id: string): string {
  return `/orders?provider=${encodeURIComponent(id)}`;
}

/**
 * Where a provider stands on the map: its base, else the first machine with
 * a point of its own (a provider that filled only its machines' addresses is
 * still «рядом»). Null when nothing is known.
 */
export function providerMapPoint(
  row: Pick<ProviderMapRow, 'baseLat' | 'baseLon' | 'machines'>,
): { lat: number; lon: number } | null {
  if (row.baseLat !== null && row.baseLon !== null && inServiceArea(row.baseLat, row.baseLon)) {
    return { lat: row.baseLat, lon: row.baseLon };
  }
  for (const machine of row.machines ?? []) {
    const lat = machine.location?.latitude;
    const lon = machine.location?.longitude;
    if (typeof lat === 'number' && typeof lon === 'number' && inServiceArea(lat, lon)) {
      return { lat, lon };
    }
  }
  return null;
}

/** 79272428088 → «+7 927 242-80-88»; other lengths with a plus. */
export function formatPhoneDigits(digits: string): string {
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}

/** The digits of a phone with the country code, or null when it is not one (11–15 digits). */
export function mapPhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/**
 * The phone on a provider's pin (owner, 2026-11-08: «так вот и номер»): the
 * company's contact phone while its «Показывать телефон на карте» switch is on
 * (null = on, the default); the house fleet's is the site's. Off, or no
 * phone → null, and the pin shows «Написать» instead.
 */
export function providerMapPhone(
  row: Pick<ProviderMapRow, 'id' | 'phone' | 'showPhoneOnMap'>,
): { phone: string; phoneHref: string } | null {
  if (row.showPhoneOnMap === false) return null;
  const digits = mapPhoneDigits(
    row.id === HOUSE_COMPANY_ID ? row.phone?.trim() || SITE.phone : row.phone,
  );
  return digits ? { phone: formatPhoneDigits(digits), phoneHref: `tel:+${digits}` } : null;
}

/**
 * The phone on a provider's public page (/providers/<id>): the same rule as
 * the pin, and nothing for a company that took itself off the map
 * («Показывать меня на карте» off) — it did not ask to be found by phone.
 */
export function providerPagePhone(
  row: Pick<ProviderMapRow, 'id' | 'phone' | 'showPhoneOnMap' | 'showOnMap'>,
): { phone: string; phoneHref: string } | null {
  if (row.showOnMap === false) return null;
  return providerMapPhone(row);
}

/** Distinct machinery types in the company's order: the first PIN_TYPES_MAX and how many more. */
export function pinMachineTypes(machines: readonly MapMachineRow[] | undefined): {
  machines: string[];
  machinesMore: number;
} {
  const types: string[] = [];
  for (const machine of machines ?? []) {
    const type = (machine.category ?? machine.name).replace(/\s+/g, ' ').trim();
    if (type && !types.includes(type)) types.push(type);
  }
  return {
    machines: types.slice(0, PIN_TYPES_MAX),
    machinesMore: Math.max(0, types.length - PIN_TYPES_MAX),
  };
}

/** «от 24 000 ₽/смена» from the cheapest machine with a shift price; null without one. */
export function pinPriceText(machines: readonly MapMachineRow[] | undefined): string | null {
  const prices = (machines ?? [])
    .map((machine) => machine.dailyRate)
    .filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length === 0) return null;
  return `от ${Math.round(Math.min(...prices)).toLocaleString('ru-RU')}\u00a0₽/смена`;
}

/** The base's city: the one its address names, else the nearest known town within 80 km. */
export function pinCity(
  row: Pick<ProviderMapRow, 'baseAddress'>,
  point: { lat: number; lon: number },
): string | null {
  return cityInText(row.baseAddress)?.name ?? nearestCity(point.lat, point.lon)?.name ?? null;
}

/**
 * The public map's markers (owner, 2026-11-08: «все всех всегда должны
 * видеть на карте в режиме офлайн и навсегда, пока не поменяют сами
 * вручную»). Every provider with published machinery and a point is here,
 * online or not, with no registration date or time; the only way off the map
 * is its own «Показывать меня на карте» switch (`showOnMap: false`). Fields
 * are copied one by one, so an e-mail, an address or a user that a query
 * happens to include never reaches the response; the phone only through
 * providerMapPhone. Coordinates are rounded to four decimals (~10 m).
 */
export function toMapPins(rows: readonly ProviderMapRow[]): ProviderMapPin[] {
  const pins: ProviderMapPin[] = [];
  for (const row of rows) {
    if (row.isProvider === false) continue;
    // The provider's own choice, and the only one that takes it off the map.
    if (row.showOnMap === false) continue;
    // Nothing published (no machinery, or all of it taken off the site): not on the map.
    if (row.equipmentCount < 1) continue;
    const point = providerMapPoint(row);
    if (!point) continue;
    const note = sanitizePinNote(row.pinNote);
    const contact = providerMapPhone(row);
    pins.push({
      id: row.id,
      name: row.name.trim().slice(0, 120),
      lat: round(point.lat, 4),
      lon: round(point.lon, 4),
      note: note.ok ? note.value : null,
      imageUrl: isDisplayableImage(row.pinImageUrl) ? row.pinImageUrl : null,
      equipmentCount: Math.max(0, Math.floor(row.equipmentCount)),
      isHouse: row.id === HOUSE_COMPANY_ID,
      // The provider's public page lists its machinery.
      catalogUrl: providerPath(row.id),
      ...pinMachineTypes(row.machines),
      city: pinCity(row, point),
      priceText: pinPriceText(row.machines),
      phone: contact?.phone ?? null,
      phoneHref: contact?.phoneHref ?? null,
      onLine: row.onLine === true,
      orderUrl: providerOrderUrl(row.id),
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

/** A viewport of the map: south-west and north-east corners. */
export interface MapBbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The map gets at most this many providers at a time: the nearest to its centre. */
export const MAP_PINS_LIMIT = 300;
/** The map gets at most this many customers' orders at a time. */
export const MAP_CUSTOMERS_LIMIT = 200;

/** «south,west,north,east» → a box, or null when it is not one. */
export function parseBbox(raw: string | null | undefined): MapBbox | null {
  if (!raw) return null;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [south, west, north, east] = parts as [number, number, number, number];
  if (south < -90 || north > 90 || south >= north || west >= east) return null;
  if (west < -180 || east > 180) return null;
  return { south, west, north, east };
}

/** The centre of a box: what the API sorts by distance from. */
export function bboxCentre(bbox: MapBbox): { lat: number; lon: number } {
  return { lat: (bbox.south + bbox.north) / 2, lon: (bbox.west + bbox.east) / 2 };
}

/** Whether a point is inside the box (inclusive). */
export function inBbox(point: { lat: number; lon: number }, bbox: MapBbox): boolean {
  return (
    point.lat >= bbox.south &&
    point.lat <= bbox.north &&
    point.lon >= bbox.west &&
    point.lon <= bbox.east
  );
}

/**
 * The pins nearest to a point, at most `limit`; the first `limit` in their
 * own order without a point. The house fleet stays first when it is in the
 * list at all. Pure, so the API's cap is unit-tested.
 */
export function nearestPins<T extends { lat: number; lon: number; isHouse?: boolean }>(
  pins: readonly T[],
  around: { lat: number; lon: number } | null,
  limit: number,
): T[] {
  if (!around) return pins.slice(0, limit);
  return [...pins]
    .sort(
      (a, b) =>
        Number(b.isHouse ?? false) - Number(a.isHouse ?? false) ||
        distanceKm(around, a) - distanceKm(around, b),
    )
    .slice(0, limit);
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
