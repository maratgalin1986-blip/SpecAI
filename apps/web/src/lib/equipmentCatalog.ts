// Catalog helpers shared by the equipment list and the machine page: task
// groups for the category tabs, which photo illustrates a category, spec
// formatting and headline prices. Pure functions — safe on server and client.

import {
  CATEGORY_GROUPS,
  categoryByName,
  categoryBySlug,
  type CategoryGroupSlug,
} from '@specai/shared';
import { defaultPhotoOf, type MachineType } from './machinePhotos';
import { HOUSE_COMPANY_ID } from './fleet';
import { houseRate } from './prices';

/** The groups of packages/shared/src/categories.ts plus «Другая» for rows outside the tree. */
export type TaskGroupId = CategoryGroupSlug | 'other';

export interface TaskGroup {
  id: TaskGroupId;
  label: string;
}

/** Short names for the catalog chips («Землеройная техника» → «Землеройная»). */
const SHORT_LABELS: Record<CategoryGroupSlug, string> = {
  earthmoving: 'Землеройная',
  lifting: 'Подъёмная',
  loading: 'Погрузочная',
  hauling: 'Перевозка',
  road: 'Дорожная',
  concrete: 'Бетон',
  drilling: 'Бурение и сваи',
  municipal: 'Коммунальная',
  equipment: 'Оборудование',
  'agri-forestry': 'Сельхоз и лес',
};

export const TASK_GROUPS: readonly TaskGroup[] = [
  ...CATEGORY_GROUPS.map((group) => ({ id: group.slug, label: SHORT_LABELS[group.slug] })),
  { id: 'other', label: 'Другая' },
];

// For categories outside the shared list (made by hand in the database).
const GROUP_RULES: [RegExp, TaskGroupId][] = [
  // "Экскаваторы-погрузчики" dig first and load second.
  [/экскаватор|бульдоз|грейдер|траншее|скрепер/i, 'earthmoving'],
  [/кран|манипулятор|вышк|подъёмник|подъемник|телескоп/i, 'lifting'],
  [/погрузчик|трактор/i, 'loading'],
  [/самосвал|тягач|трал|длинномер|грузовик|шаланд|эвакуатор|прицеп/i, 'hauling'],
  [/кат(ок|ки)|асфальт|фрез|гудронатор|разметоч/i, 'road'],
  [/бетон|миксер|раствор/i, 'concrete'],
  [/бур|сва[ийе]|гидромолот|виброплит/i, 'drilling'],
  [/илосос|вакуум|водовоз|поливомо|снег|мусоровоз|подметал/i, 'municipal'],
  [/генератор|компрессор|освет|теплов|бытовк|контейнер/i, 'equipment'],
  [/сельхоз|комбайн|лесозагот|харвестер|форвардер/i, 'agri-forestry'],
];

/**
 * Which task group a category belongs to: by its slug or exact name in the
 * shared list, otherwise guessed from the name.
 */
export function taskGroupOf(categoryName: string, slug?: string | null): TaskGroupId {
  const def = categoryBySlug(slug) ?? categoryByName(categoryName);
  if (def) return def.group as TaskGroupId;
  for (const [pattern, group] of GROUP_RULES) {
    if (pattern.test(categoryName)) return group;
  }
  return 'other';
}

export function isTaskGroupId(value: string | undefined): value is TaskGroupId {
  return TASK_GROUPS.some((group) => group.id === value);
}

/** Group ids of older catalog links (?group=earth) still open the right chip. */
const LEGACY_GROUP_IDS: Record<string, TaskGroupId> = {
  earth: 'earthmoving',
  transport: 'hauling',
};

export function normalizeTaskGroupId(value: string | undefined): TaskGroupId | undefined {
  if (isTaskGroupId(value)) return value;
  return value ? LEGACY_GROUP_IDS[value] : undefined;
}

/**
 * The photo type of each category in the shared list: the nearest of our
 * photos, or null when none looks like it (a forklift is not a wheel loader,
 * a tower crane is not an автокран) — then a drawn placeholder is shown and
 * the house price list does not apply. Categories left out fall back to the
 * name rules below.
 */
const CATEGORY_MACHINE: Record<string, MachineType | null> = {
  excavators: 'excavator',
  'wheeled-excavators': 'wheeled-excavator',
  'mini-excavators': 'excavator',
  'backhoe-loaders': 'backhoe',
  bulldozers: 'dozer',
  graders: null,
  trenchers: null,
  scrapers: null,
  cranes: 'crane',
  'crane-trucks': 'kmu',
  'aerial-platforms': 'agp',
  'tower-cranes': null,
  'crawler-cranes': 'crane',
  telehandlers: null,
  'scissor-lifts': null,
  loaders: 'loader',
  'skid-steers': null,
  forklifts: null,
  tractors: 'tractor',
  'dump-trucks': 'truck',
  lowboys: 'truck',
  flatbeds: 'truck',
  'tractor-units': 'truck',
  'tow-trucks': 'truck',
  'special-trailers': null,
  rollers: 'roller',
  'farm-tractors': 'tractor',
};

/**
 * Which machine type illustrates a listing, or null when none of our photos
 * looks like it (a forklift is not a wheel loader) — then the page shows a
 * drawn placeholder instead. The machine's own name is read first (a backhoe
 * listed under «Экскаваторы гусеничные», a KMU under «Автокраны»), then the
 * category: the shared list by exact name, or the name rules for other rows.
 */
export function machineTypeOf(categoryName: string, machineName = ''): MachineType | null {
  const category = categoryName.toLowerCase();
  const name = machineName.toLowerCase();
  const both = `${category} ${name}`;
  if (/экскаватор/.test(both) && /погрузчик/.test(both)) return 'backhoe';
  if (/экскаватор/.test(both) && /колёсн|колесн/.test(both)) return 'wheeled-excavator';
  if (/манипулятор|кму/.test(both)) return 'kmu';
  if (/вышк|(^|[^а-яё])агп([^а-яё]|$)/.test(both)) return 'agp';
  if (/кат(ок|ки)/.test(both)) return 'roller';

  const def = categoryByName(categoryName);
  if (def) {
    const mapped = CATEGORY_MACHINE[def.slug];
    if (mapped !== undefined) return mapped;
  }

  if (/экскаватор/.test(category)) return 'excavator';
  if (/подъ[её]мник/.test(both)) return 'agp';
  if (/кран/.test(category)) return 'crane';
  if (/погрузчик/.test(category) && !/вилоч|телескоп|мини/.test(both)) return 'loader';
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
const WEEK_SHIFTS = 5;
const MONTH_SHIFTS = 22;

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
 * The rates a customer sees. СпецПласт16's own machines: the hourly rate never
 * below the lib/prices.ts list (as on /arenda), the shift never below 8 such
 * hours. Other providers' machines show their own rates (an hour from the
 * shift and back when only one is set). Without `companyId` the machine is
 * treated as the house's (older callers).
 */
export function customerRates(item: {
  name: string;
  categoryName: string;
  companyId?: string | null;
  hourlyRate?: Amount;
  dailyRate?: Amount;
  weeklyRate?: Amount;
  monthlyRate?: Amount;
}): {
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number | null;
  monthlyRate: number | null;
} {
  const weekly = toNumber(item.weeklyRate);
  const monthly = toNumber(item.monthlyRate);
  if (item.companyId !== undefined && item.companyId !== HOUSE_COMPANY_ID) {
    const hour = toNumber(item.hourlyRate);
    const shift = toNumber(item.dailyRate);
    return {
      hourlyRate: hour ?? (shift !== null ? shift / SHIFT_HOURS : 0),
      dailyRate: shift ?? (hour !== null ? hour * SHIFT_HOURS : 0),
      weeklyRate: weekly,
      monthlyRate: monthly,
    };
  }
  const hourlyRate = houseRate(
    toNumber(item.hourlyRate),
    machineTypeOf(item.categoryName, item.name),
  );
  const dailyRate = Math.max(toNumber(item.dailyRate) ?? 0, hourlyRate * SHIFT_HOURS);
  // A week or a month may be cheaper per day, but not below its working days
  // (5 and 22 shifts) at the list price.
  return {
    hourlyRate,
    dailyRate,
    weeklyRate: weekly === null ? null : Math.max(weekly, dailyRate * WEEK_SHIFTS),
    monthlyRate: monthly === null ? null : Math.max(monthly, dailyRate * MONTH_SHIFTS),
  };
}

/** "24 000 ₽", kept on one line by a non-breaking space before the sign. */
export function rub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')}\u00a0₽`;
}
