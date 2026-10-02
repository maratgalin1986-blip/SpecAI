// Editing a listing in the provider cabinet (site and app): the statuses a
// provider picks from, and the «Параметр / Значение» rows of the specs.
// Pure functions, safe for client components.

export type EquipmentStatusValue = 'AVAILABLE' | 'RENTED' | 'IN_MAINTENANCE' | 'RETIRED';

/** What a provider can set; RETIRED is «Снять с публикации» (hidden from the catalog and map). */
export const EQUIPMENT_STATUS_OPTIONS: { value: EquipmentStatusValue; label: string }[] = [
  { value: 'AVAILABLE', label: 'Свободна' },
  { value: 'RENTED', label: 'Занята' },
  { value: 'IN_MAINTENANCE', label: 'На ремонте' },
  { value: 'RETIRED', label: 'Снята с публикации' },
];

export function equipmentStatusLabel(status: string): string {
  return EQUIPMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

/** Whether customers see the machine in the catalog and on the map. */
export function isPublished(status: string): boolean {
  return status !== 'RETIRED';
}

export type SpecValue = string | number | boolean;
export interface SpecRow {
  key: string;
  value: string;
}

/** Rows → specs object: empty rows are dropped, plain numbers become numbers. */
export function specsFromRows(rows: readonly SpecRow[]): Record<string, SpecValue> | undefined {
  const specs: Record<string, SpecValue> = {};
  for (const row of rows) {
    const key = row.key.trim().slice(0, 100);
    const value = row.value.trim().slice(0, 300);
    if (!key || !value) continue;
    const numeric = Number(value.replace(',', '.').replace(/\s/g, ''));
    specs[key] =
      /^-?[\d\s]+(?:[.,]\d+)?$/.test(value) && Number.isFinite(numeric) ? numeric : value;
  }
  return Object.keys(specs).length > 0 ? specs : undefined;
}

/** Specs object (from the database) → editable rows. */
export function rowsFromSpecs(specs: unknown): SpecRow[] {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return [];
  return Object.entries(specs as Record<string, unknown>)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => ({ key, value: String(value) }));
}

/** A price field → number; null when empty, NaN when it is not a positive number. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}
