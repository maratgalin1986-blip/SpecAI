// Catalog helpers shared by the equipment list and the machine page: task
// groups for the category tabs, which photo illustrates a category, spec
// formatting and headline prices. Pure functions — safe on server and client.

import { defaultPhotoOf, type MachineType } from './machinePhotos';
import { houseRate } from './prices';

export type TaskGroupId = 'earth' | 'lifting' | 'loading' | 'transport' | 'other';

export interface TaskGroup {
  id: TaskGroupId;
  label: string;
}

export const TASK_GROUPS: readonly TaskGroup[] = [
  { id: 'earth', label: 'Землеройная' },
  { id: 'lifting', label: 'Подъёмная' },
  { id: 'loading', label: 'Погрузочная' },
  { id: 'transport', label: 'Транспортная' },
  { id: 'other', label: 'Другая' },
];

const GROUP_RULES: [RegExp, TaskGroupId][] = [
  // "Экскаваторы-погрузчики" dig first and load second.
  [/экскаватор|бульдоз|грейдер|траншее|бур/i, 'earth'],
  [/кран|манипулятор|вышк|подъёмник|подъемник/i, 'lifting'],
  [/погрузчик/i, 'loading'],
  [/самосвал|трактор|тягач|трал|длинномер|грузовик/i, 'transport'],
];

/** Which task group a category belongs to, from its name. */
export function taskGroupOf(categoryName: string): TaskGroupId {
  for (const [pattern, group] of GROUP_RULES) {
    if (pattern.test(categoryName)) return group;
  }
  return 'other';
}

export function isTaskGroupId(value: string | undefined): value is TaskGroupId {
  return TASK_GROUPS.some((group) => group.id === value);
}

/**
 * Which machine type illustrates a listing, or null when none of our photos
 * looks like it (a forklift is not a wheel loader) — then the page shows a
 * drawn placeholder instead.
 */
export function machineTypeOf(categoryName: string, machineName = ''): MachineType | null {
  const category = categoryName.toLowerCase();
  const name = machineName.toLowerCase();
  const both = `${category} ${name}`;
  if (/экскаватор/.test(category) && /погрузчик/.test(both)) return 'backhoe';
  if (/экскаватор/.test(both) && /колёсн|колесн/.test(both)) return 'wheeled-excavator';
  if (/экскаватор/.test(category)) return 'excavator';
  if (/манипулятор|кму/.test(both)) return 'kmu';
  if (/вышк|(^|[^а-яё])агп([^а-яё]|$)|подъ[её]мник/.test(both)) return 'agp';
  if (/кат(ок|ки)/.test(both)) return 'roller';
  if (/кран/.test(category)) return 'crane';
  if (/погрузчик/.test(category) && !/вилоч|телескоп|мини/.test(name)) return 'loader';
  if (/самосвал/.test(category)) return 'truck';
  if (/бульдоз/.test(category)) return 'dozer';
  if (/трактор/.test(category)) return 'tractor';
  return null;
}

/** The server-rendered illustrative photo of the machine type, or null. */
export function machinePhotoOf(categoryName: string, machineName = ''): string | null {
  const type = machineTypeOf(categoryName, machineName);
  return type ? defaultPhotoOf(type) : null;
}

export type SpecValue = string | number | boolean;

export interface SpecEntry {
  key: string;
  label: string;
  unit: string;
  value: string;
}

function formatSpecValue(value: SpecValue): string {
  if (typeof value === 'number') return value.toLocaleString('ru-RU');
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return value;
}

/**
 * Specs JSON → display rows. Keys look like "Грузоподъёмность, т": the part
 * after the last comma is the unit. Nested objects and empty values are skipped.
 */
export function specEntries(specs: unknown): SpecEntry[] {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return [];
  const rows: SpecEntry[] = [];
  for (const [key, raw] of Object.entries(specs as Record<string, unknown>)) {
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const comma = key.lastIndexOf(', ');
    const hasUnit = comma > 0 && key.length - comma <= 12;
    rows.push({
      key,
      label: hasUnit ? key.slice(0, comma) : key,
      unit: hasUnit ? key.slice(comma + 2) : '',
      value: formatSpecValue(raw),
    });
  }
  return rows;
}

/** A spec as a short chip: "Грузоподъёмность 32 т", "Навесное оборудование: ковш". */
export function specChip(entry: SpecEntry): string {
  if (!/^[\d\s,.-]+$/.test(entry.value)) return `${entry.label}: ${entry.value}`;
  const unit = entry.unit ? ` ${entry.unit}` : '';
  return `${entry.label} ${entry.value}${unit}`;
}

/** Up to `limit` specs for chips; prices live in the price block, not in chips. */
export function keySpecs(specs: unknown, limit = 3): SpecEntry[] {
  return specEntries(specs)
    .filter((entry) => !/цена|₽|стоимост/i.test(entry.key))
    .slice(0, limit);
}

/** A numeric spec whose key matches `pattern`, e.g. dig depth for the 3D envelope. */
export function numericSpec(specs: unknown, pattern: RegExp): number | null {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  for (const [key, value] of Object.entries(specs as Record<string, unknown>)) {
    if (pattern.test(key) && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

export const SHIFT_HOURS = 8;

type Amount = number | string | { toString(): string } | null | undefined;

function toNumber(amount: Amount): number | null {
  if (amount === null || amount === undefined) return null;
  const value = typeof amount === 'number' ? amount : Number(amount.toString());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Headline prices: per machine-hour (when set) and per 8-hour shift. */
export function headlinePrices(item: { hourlyRate?: Amount; dailyRate?: Amount }) {
  const hour = toNumber(item.hourlyRate);
  const shift = toNumber(item.dailyRate) ?? (hour !== null ? hour * SHIFT_HOURS : null);
  return { hour, shift };
}

/**
 * The rates a customer sees for a house machine: the hourly rate never below
 * the lib/prices.ts list (as on /arenda), the shift never below 8 such hours.
 */
export function customerRates(item: {
  name: string;
  categoryName: string;
  hourlyRate?: Amount;
  dailyRate?: Amount;
}): { hourlyRate: number; dailyRate: number } {
  const hourlyRate = houseRate(
    toNumber(item.hourlyRate),
    machineTypeOf(item.categoryName, item.name),
  );
  const dailyRate = Math.max(toNumber(item.dailyRate) ?? 0, hourlyRate * SHIFT_HOURS);
  return { hourlyRate, dailyRate };
}

/** "24 000 ₽", kept on one line by a non-breaking space before the sign. */
export function rub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')}\u00a0₽`;
}
