// What the customer may read in a provider's offer. The bid text is the
// provider's, so phones, handles and links in it stay hidden until the
// customer's booking with that very offer is confirmed (CLAUDE.md: contacts
// only on CONFIRMED/ACTIVE/COMPLETED). Shared by GET /api/orders and
// GET /api/orders/[id], so the app's list and the order page agree.
import { maskContactsAndLinks } from './privacy';

const CONTACTS_OPEN = ['CONFIRMED', 'ACTIVE', 'COMPLETED'];

export function contactsOpenFor(bookingStatus: string | null | undefined): boolean {
  return CONTACTS_OPEN.includes(bookingStatus ?? '');
}

export function bidForCustomer<T extends { status: string; message: string | null }>(
  bid: T,
  bookingStatus: string | null | undefined,
): T {
  if (!bid.message || (contactsOpenFor(bookingStatus) && bid.status === 'ACCEPTED')) return bid;
  return { ...bid, message: maskContactsAndLinks(bid.message) };
}
