// What an offer is made of, for the customer's offer card: the total for the
// whole period (that is what a bid's price means, see BidForm), the days, the
// price per day, and the machine's own rates from its card for comparison.
// With the provider's own breakdown (подача + смена × смен, Bid columns)
// those parts are shown too. Pure, unit-tested.

import { customerRates } from './equipmentCatalog';
import { formatMoney } from './money';

export interface OfferBreakdown {
  total: number;
  days: number;
  perDay: number;
  /** Rates from the machine's public card (customerRates, as the machine page shows them). */
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

/**
 * The machine of an offer. With its name, category and company the card
 * rates are the ones the customer sees on the machine page (customerRates:
 * the house fleet never below the price list); with only the stored rates
 * (older callers) those are shown as they are.
 */
export interface OfferEquipment {
  hourlyRate?: unknown;
  dailyRate?: unknown;
  name?: string;
  categoryName?: string;
  companyId?: string | null;
}

/** The card rates of an offer's machine, the same numbers as on the machine page. */
export function cardRates(equipment: OfferEquipment): {
  hour: number | null;
  shift: number | null;
} {
  if (equipment.name === undefined || equipment.categoryName === undefined) {
    return { hour: num(equipment.hourlyRate), shift: num(equipment.dailyRate) };
  }
  const rates = customerRates({
    name: equipment.name,
    categoryName: equipment.categoryName,
    companyId: equipment.companyId,
    hourlyRate: num(equipment.hourlyRate),
    dailyRate: num(equipment.dailyRate),
  });
  return { hour: rates.hourlyRate || null, shift: rates.dailyRate || null };
}

export function offerBreakdown(
  price: unknown,
  start: Date,
  end: Date,
  equipment: OfferEquipment,
  parts: BidParts = {},
): OfferBreakdown {
  const total = num(price) ?? 0;
  const days = orderDays(start, end);
  const { hour: cardHour, shift: cardShift } = cardRates(equipment);
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
 * Why a bid on a house-fleet machine is below the price list, or null when it
 * is not. `floorShift` is bidShiftFloor() of the machine — the shift price
 * the customer sees on its card. With a breakdown the shift price itself must
 * reach the floor; without one the total must cover the floor for every day
 * of the order (the shifts), whatever the delivery adds. The message goes to
 * the fleet manager as a 400 — the price is never changed silently.
 */
export function houseFloorError(
  bid: { price: number; shiftPrice?: number | null; shifts?: number | null },
  floorShift: number | null,
  days: number,
): string | null {
  if (floorShift === null || floorShift <= 0) return null;
  const minimum = `Цена ниже прайса СпецПласт16: минимум ${formatMoney(floorShift)} за смену`;
  if (bid.shiftPrice) {
    return bid.shiftPrice + 1 < floorShift ? minimum : null;
  }
  const shifts = Math.max(1, Math.round(bid.shifts ?? days));
  const total = floorShift * shifts;
  if (bid.price + 1 >= total) return null;
  return `${minimum}, за ${shifts} ${shiftWord(shifts)} — ${formatMoney(total)}`;
}

function shiftWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'смену';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'смены';
  return 'смен';
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
