// Customers on the public map (owner, 2026-11-08: «при выборе заказчика или
// исполнителя, чтобы было видно вокруг него, кто регистрировался»): a
// customer is a pin while it has an open order with a place. Only what the
// public orders board (/orders, lib/orderBoard.ts) already shows leaves the
// server: the short name («Анна П.», lib/customerPrivacy.ts), the machinery
// wanted and the order's link. Never a phone, an e-mail or the address; the
// point is rounded to about a kilometre, so the pin says «рядом», not «здесь».
// Pure, unit-tested; the rows come from lib/providerMapData.ts.

import { customerShortName } from './customerPrivacy';
import { inServiceArea, orderPoint } from './geo';

/** Decimals kept of a customer's point: two is about 1.1 km. */
export const CUSTOMER_POINT_DECIMALS = 2;
/** The bold first line of every customer pin. */
export const CUSTOMER_PIN_TITLE = 'Заказчик рядом';
/** What the pin says when the order names no machinery. */
export const ANY_MACHINERY = 'любая техника';

export interface CustomerOrderRow {
  id: string;
  category: { name: string } | null;
  customer: { name: string | null };
  /** The author of a chat or guest order (no account); shortened like a customer. */
  contactName?: string | null;
  location: {
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    addressLine?: string | null;
  } | null;
}

/** One customer's pin: safe for a guest, nothing personal beyond «Анна П.». */
export interface CustomerMapPin {
  /** The order's id: the pin opens the order. */
  id: string;
  lat: number;
  lon: number;
  /** «Заказчик рядом». */
  title: string;
  /** «нужно: Экскаваторы · Анна П.». */
  sub: string;
  /** «Экскаваторы», or «любая техника». */
  machinery: string;
  /** «Анна П.» */
  customer: string;
  /** The order on the public board. */
  orderUrl: string;
  /** Always true: the point is rounded, the real address is not on the map. */
  approximate: true;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Open orders → customer pins. An order without a place that can be put on
 * the map (no point and no known city) is skipped. Fields are copied one by
 * one: the description, the contacts, the dates and the address never reach
 * the response. One pin per order; a customer with two open orders is two
 * pins, as on the board.
 */
export function toCustomerPins(rows: readonly CustomerOrderRow[]): CustomerMapPin[] {
  const pins: CustomerMapPin[] = [];
  for (const row of rows) {
    const point = orderPoint(row.location);
    if (!point || !inServiceArea(point.lat, point.lon)) continue;
    const machinery = row.category?.name?.trim() || ANY_MACHINERY;
    const author = row.contactName?.trim() ? row.contactName : row.customer.name;
    const customer = customerShortName(author);
    pins.push({
      id: row.id,
      lat: roundTo(point.lat, CUSTOMER_POINT_DECIMALS),
      lon: roundTo(point.lon, CUSTOMER_POINT_DECIMALS),
      title: CUSTOMER_PIN_TITLE,
      sub: `нужно: ${machinery} · ${customer}`,
      machinery,
      customer,
      orderUrl: `/orders/${encodeURIComponent(row.id)}`,
      approximate: true,
    });
  }
  return pins;
}
