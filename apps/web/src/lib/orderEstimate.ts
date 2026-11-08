import { machineTypeOf } from '@/lib/equipmentCatalog';
import { RATES, SHIFT_HOURS } from '@/lib/prices';

// The instant price guide on the order forms («как в такси — цена до заказа»):
// the machine type of the chosen category → the house hourly price from
// lib/prices.ts → one 8-hour shift and the whole period. It is a guide only:
// providers on the platform bid their own prices (aggregator, owner 2026-10-06),
// so the text never promises a final sum.

/** The longest period the guide multiplies; longer orders get «по договорённости». */
export const ESTIMATE_MAX_DAYS = 60;

export interface OrderEstimate {
  perHour: number;
  perShift: number;
  days: number;
  /** perShift × days, or null when the period is unknown or too long. */
  total: number | null;
}

function dayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}

/** Days from start to end inclusive; an empty end means one day. Null when unknown. */
export function orderDays(startDate: string, endDate: string): number | null {
  const start = dayNumber(startDate);
  if (start === null) return null;
  const end = endDate ? dayNumber(endDate) : start;
  if (end === null || end < start) return null;
  return end - start + 1;
}

/**
 * The guide for a category name and dates, or null when the category has no
 * house price (forklifts, tower cranes…): then nothing is shown rather than a
 * made-up number.
 */
export function orderEstimate(
  categoryName: string | undefined,
  startDate: string,
  endDate: string,
): OrderEstimate | null {
  if (!categoryName) return null;
  const type = machineTypeOf(categoryName);
  if (!type) return null;
  const perHour = RATES[type];
  const perShift = perHour * SHIFT_HOURS;
  const days = orderDays(startDate, endDate) ?? 1;
  const known = orderDays(startDate, endDate) !== null;
  return {
    perHour,
    perShift,
    days,
    total: known && days <= ESTIMATE_MAX_DAYS ? perShift * days : null,
  };
}
