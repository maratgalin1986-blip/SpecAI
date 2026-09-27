import type { Prisma } from '@specai/database';
import type { EquipmentSort } from '@specai/shared';

/** Parses a `page` query parameter: a positive integer, defaulting to 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** Returns the value if it is one of `allowed`, otherwise `fallback`. */
export function parseEnumParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = Array.isArray(value) ? value[0] : value;
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export const EQUIPMENT_ORDER_BY: Record<
  EquipmentSort,
  Prisma.EquipmentOrderByWithRelationInput | Prisma.EquipmentOrderByWithRelationInput[]
> = {
  newest: { createdAt: 'desc' },
  price_asc: [{ dailyRate: 'asc' }, { createdAt: 'desc' }],
  price_desc: [{ dailyRate: 'desc' }, { createdAt: 'desc' }],
  name: [{ name: 'asc' }, { createdAt: 'desc' }],
};

export const EQUIPMENT_SORT_LABELS: Record<EquipmentSort, string> = {
  newest: 'Сначала новые',
  price_asc: 'Сначала дешевле',
  price_desc: 'Сначала дороже',
  name: 'По названию',
};
