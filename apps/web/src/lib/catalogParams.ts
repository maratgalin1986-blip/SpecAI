// Query parameters of the /equipment catalogue, cleaned before they reach Prisma.

export interface EquipmentSearchParams {
  category?: string;
  group?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  q?: string;
  sort?: string;
  page?: string;
}

export const FILTER_KEYS = ['q', 'city', 'minPrice', 'maxPrice', 'sort'] as const;
const PARAM_KEYS = ['category', 'group', ...FILTER_KEYS, 'page'] as const;

/** Only single short strings survive: `?q=a&q=b` arrives as an array. */
export function cleanSearchParams(raw: Record<string, unknown>): EquipmentSearchParams {
  const clean: EquipmentSearchParams = {};
  for (const key of PARAM_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) clean[key] = value.trim().slice(0, 100);
  }
  return clean;
}

/** A price filter: a finite non-negative number, anything else is ignored. */
export function priceParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
