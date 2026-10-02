// What an offer is made of, for the customer's offer card: the total for the
// whole period (that is what a bid's price means, see BidForm), the days, the
// price per day, and the machine's own rates from its card for comparison.
// Pure, unit-tested.

export interface OfferBreakdown {
  total: number;
  days: number;
  perDay: number;
  /** Rates from the machine's public card. */
  cardHour: number | null;
  cardShift: number | null;
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

export function offerBreakdown(
  price: unknown,
  start: Date,
  end: Date,
  equipment: { hourlyRate?: unknown; dailyRate?: unknown },
): OfferBreakdown {
  const total = num(price) ?? 0;
  const days = orderDays(start, end);
  const cardShift = num(equipment.dailyRate);
  const cardHour = num(equipment.hourlyRate);
  return {
    total,
    days,
    perDay: Math.round(total / days),
    cardHour,
    cardShift,
  };
}
