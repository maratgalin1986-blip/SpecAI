// Catalog helpers shared by the equipment list and the machine page: task
// groups for the category tabs, which 3D model illustrates a category, spec
// formatting and headline prices. Pure functions — safe on server and client.

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

export type MachineKind = 'backhoe' | 'crane' | 'wheelLoader' | 'dumpTruck' | 'dozer';

/**
 * The machine class a listing belongs to, or null when none of ours looks
 * like it (a crawler excavator is not a backhoe loader, a tractor is not a
 * wheel loader) — then the page shows a static placeholder instead.
 */
export function machineKindOf(categoryName: string, machineName = ''): MachineKind | null {
  const category = categoryName.toLowerCase();
  const name = machineName.toLowerCase();
  if (/экскаватор/.test(category) && /погрузчик/.test(category)) return 'backhoe';
  if (/манипулятор/.test(category) || /манипулятор/.test(name)) return null;
  if (/кран/.test(category)) return 'crane';
  if (/погрузчик/.test(category) && !/вилоч|телескоп|мини/.test(name)) return 'wheelLoader';
  if (/самосвал/.test(category)) return 'dumpTruck';
  if (/бульдоз/.test(category)) return 'dozer';
  return null;
}

const KIND_PHOTO: Record<MachineKind, string> = {
  backhoe: '/images/backhoe.jpg',
  crane: '/images/crane.jpg',
  wheelLoader: '/images/loader.jpg',
  dumpTruck: '/images/truck.jpg',
  dozer: '/images/dozer.jpg',
};

/** An illustrative photo of the machine class, or null when none fits. */
export function machinePhotoOf(categoryName: string, machineName = ''): string | null {
  const kind = machineKindOf(categoryName, machineName);
  if (kind) return KIND_PHOTO[kind];
  if (/трактор/i.test(categoryName)) return '/images/tractor.jpg';
  return null;
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

/** "24 000 ₽", kept on one line by a non-breaking space before the sign. */
export function rub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')}\u00a0₽`;
}
