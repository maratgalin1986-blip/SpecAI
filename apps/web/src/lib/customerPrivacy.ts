// What a provider learns about a customer (owner's decision, 2026-10-02):
// in bookings and orders only a short name («Анна П.»); the phone and e-mail
// once the provider has confirmed the booking (CONFIRMED, ACTIVE, COMPLETED).
// Pure functions, unit-tested; used by /provider, /api/bookings?as=provider,
// /orders and the orders API.

import { shortAuthorName } from './comments';

/** Booking statuses after which the provider may contact the customer. */
export const CONTACT_STATUSES = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

export function canSeeCustomerContacts(bookingStatus: string): boolean {
  return (CONTACT_STATUSES as readonly string[]).includes(bookingStatus);
}

/** «Анна Петрова» → «Анна П.»; an e-mail or an empty name → «Заказчик». */
export function customerShortName(name: string | null | undefined): string {
  const short = shortAuthorName(name);
  return short === 'Пользователь' ? 'Заказчик' : short;
}

export const CONTACTS_AFTER_CONFIRM =
  'Телефон и e-mail заказчика появятся после того, как вы подтвердите бронь';

export interface ProviderCustomerView {
  /** Kept for comments about the customer; never shown. */
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactsVisible: boolean;
}

/** The customer of a booking as its provider may see it. */
export function customerForProvider(
  customer: { id: string; name: string; email?: string | null; phone?: string | null },
  bookingStatus: string,
): ProviderCustomerView {
  const visible = canSeeCustomerContacts(bookingStatus);
  return {
    id: customer.id,
    name: customerShortName(customer.name),
    email: visible ? (customer.email ?? null) : null,
    phone: visible ? (customer.phone ?? null) : null,
    contactsVisible: visible,
  };
}

export interface CustomerProviderView {
  name: string;
  /** null until the provider confirms the booking. */
  phone: string | null;
}

/**
 * The provider of a booking as its customer sees it: the company name always,
 * its phone from CONFIRMED on (the same moment the provider gets the
 * customer's contacts). The own fleet falls back to the site's phone.
 */
export function providerForCustomer(
  company: { id: string; name: string; phone?: string | null },
  bookingStatus: string,
  houseCompanyId: string,
  sitePhone: string,
): CustomerProviderView {
  const phone = company.phone?.trim() || (company.id === houseCompanyId ? sitePhone : null);
  return {
    name: company.name,
    phone: canSeeCustomerContacts(bookingStatus) ? phone : null,
  };
}
