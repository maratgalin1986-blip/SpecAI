// What a machine operator («машинист») learns about a booking assigned to
// them (CLAUDE.md privacy rules): the machine, the dates, the site address
// and — only for a CONFIRMED or ACTIVE booking — the on-site contact phone.
// No prices, no customer name or e-mail, no other orders. Pure, unit-tested.

/** Booking statuses during which the operator may call the site contact. */
export const OPERATOR_CONTACT_STATUSES = ['CONFIRMED', 'ACTIVE'] as const;

export interface OperatorBookingView {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
  equipment: { id: string; name: string; imageUrls: string[] };
  /**
   * Site address: the delivery location, else the address of the order the
   * booking was made from; null when the customer gave none.
   */
  siteAddress: string | null;
  /** The on-site contact phone, only while the booking is CONFIRMED or ACTIVE. */
  contactPhone: string | null;
  /**
   * Whose phone it is: the customer's own, the contact of the order the
   * booking was made from (guest and chat orders), or the dispatcher's — the
   * site phone, when the customer left none.
   */
  contactKind: 'customer' | 'order' | 'dispatcher' | null;
  notes: string | null;
}

export function operatorCanCallSite(bookingStatus: string): boolean {
  return (OPERATOR_CONTACT_STATUSES as readonly string[]).includes(bookingStatus);
}

/**
 * The phone the operator calls on site: the customer's own, else the contact
 * of the order the booking came from (guest and chat orders carry one while
 * their technical customer account has no phone), else the dispatcher's —
 * `fallbackPhone`, the site phone. Null when none is known.
 */
export function siteContactPhone(
  booking: {
    customer?: { phone?: string | null } | null;
    order?: { contactPhone?: string | null } | null;
  },
  fallbackPhone: string | null = null,
): { phone: string; kind: 'customer' | 'order' | 'dispatcher' } | null {
  const customer = booking.customer?.phone?.trim();
  if (customer) return { phone: customer, kind: 'customer' };
  const order = booking.order?.contactPhone?.trim();
  if (order) return { phone: order, kind: 'order' };
  const dispatcher = fallbackPhone?.trim();
  if (dispatcher) return { phone: dispatcher, kind: 'dispatcher' };
  return null;
}

/** Strip a booking row to what the assigned operator may see. */
export function bookingForOperator(
  booking: {
    id: string;
    status: string;
    startDate: Date;
    endDate: Date;
    notes?: string | null;
    equipment: { id: string; name: string; imageUrls?: string[] };
    customer?: { phone?: string | null } | null;
    deliveryLocation?: { addressLine: string; city: string } | null;
    order?: {
      contactPhone?: string | null;
      location?: { addressLine: string; city: string } | null;
    } | null;
  },
  maskText: (text: string) => string = (text) => text,
  /** The dispatcher's phone (the site phone) when the customer left none. */
  fallbackPhone: string | null = null,
): OperatorBookingView {
  const location = booking.deliveryLocation ?? booking.order?.location ?? null;
  // The typed address often already names the city: do not repeat it.
  const siteAddress = location
    ? location.city && !location.addressLine.toLowerCase().includes(location.city.toLowerCase())
      ? [location.addressLine, location.city].filter(Boolean).join(', ')
      : location.addressLine || location.city
    : null;
  const contact = operatorCanCallSite(booking.status)
    ? siteContactPhone(booking, fallbackPhone)
    : null;
  return {
    id: booking.id,
    status: booking.status,
    startDate: booking.startDate,
    endDate: booking.endDate,
    equipment: {
      id: booking.equipment.id,
      name: booking.equipment.name,
      imageUrls: booking.equipment.imageUrls ?? [],
    },
    siteAddress,
    contactPhone: contact?.phone ?? null,
    contactKind: contact?.kind ?? null,
    // The customer's notes may hold contacts: shown masked, as chat orders are.
    notes: booking.notes ? maskText(booking.notes) : null,
  };
}
