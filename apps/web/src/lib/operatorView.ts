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
  /** Site address from the delivery location; null when the customer gave none. */
  siteAddress: string | null;
  /** The on-site contact phone, only while the booking is CONFIRMED or ACTIVE. */
  contactPhone: string | null;
  notes: string | null;
}

export function operatorCanCallSite(bookingStatus: string): boolean {
  return (OPERATOR_CONTACT_STATUSES as readonly string[]).includes(bookingStatus);
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
  },
  maskText: (text: string) => string = (text) => text,
): OperatorBookingView {
  const location = booking.deliveryLocation;
  const siteAddress = location
    ? [location.addressLine, location.city].filter(Boolean).join(', ')
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
    contactPhone: operatorCanCallSite(booking.status) ? (booking.customer?.phone ?? null) : null,
    // The customer's notes may hold contacts: shown masked, as chat orders are.
    notes: booking.notes ? maskText(booking.notes) : null,
  };
}
