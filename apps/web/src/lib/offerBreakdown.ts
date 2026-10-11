// What an offer is made of, for the customer's offer card: the total for the
// whole period (that is what a bid's price means, see BidForm), the days, the
// price per day, and the machine's own rates from its card for comparison.
// With the provider's own breakdown (подача + смена × смен, Bid columns)
// those parts are shown too. Pure, unit-tested.

export interface OfferBreakdown {
  total: number;
  days: number;
  perDay: number;
  /** Rates from the machine's public card. */
  cardHour: number | null;
  cardShift: number | null;
  /** The provider's breakdown, when it gave one. */
  delivery: number | null;
  shiftPrice: number | null;
  shifts: number | null;
  optionsNote: string | null;
}

/** The breakdown columns of a bid (Prisma Decimals come as objects). */
export interface BidParts {
  deliveryPrice?: unknown;
  shiftPrice?: unknown;
  shifts?: unknown;
  optionsNote?: string | null;
}

const DAY = 86_400_000;

/** Calendar days of an order, both ends included; at least one. */
export function orderDays(start: Date, end: Date): number {
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  return Number.isFinite(days) && days > 0 ? days : 1;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Like num, but zero is a value too (a free delivery). */
const amount = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function offerBreakdown(
  price: unknown,
  start: Date,
  end: Date,
  equipment: { hourlyRate?: unknown; dailyRate?: unknown },
  parts: BidParts = {},
): OfferBreakdown {
  const total = num(price) ?? 0;
  const days = orderDays(start, end);
  const cardShift = num(equipment.dailyRate);
  const cardHour = num(equipment.hourlyRate);
  const shiftPrice = num(parts.shiftPrice);
  const shifts = num(parts.shifts);
  return {
    total,
    days,
    perDay: Math.round(total / days),
    cardHour,
    cardShift,
    delivery: amount(parts.deliveryPrice),
    shiftPrice: shiftPrice && shifts ? shiftPrice : null,
    shifts: shiftPrice && shifts ? Math.round(shifts) : null,
    optionsNote: parts.optionsNote?.trim() || null,
  };
}

/** Total of a breakdown: подача + смена × смен (rounded to kopecks). */
export function bidTotal(
  deliveryPrice: number | null | undefined,
  shiftPrice: number,
  shifts: number,
): number {
  return Math.round(((deliveryPrice ?? 0) + shiftPrice * shifts) * 100) / 100;
}

/**
 * Whether a bid's price matches its own breakdown (a rouble of rounding is
 * fine). Without a shift price or shifts there is nothing to check.
 */
export function bidSumMatches(
  price: number,
  parts: { deliveryPrice?: number | null; shiftPrice?: number | null; shifts?: number | null },
): boolean {
  if (!parts.shiftPrice || !parts.shifts) return true;
  return Math.abs(price - bidTotal(parts.deliveryPrice, parts.shiftPrice, parts.shifts)) <= 1;
}
