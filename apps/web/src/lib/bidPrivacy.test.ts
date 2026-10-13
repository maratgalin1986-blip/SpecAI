import { describe, expect, it } from 'vitest';
import { bidForCustomer, bookedProviderSees } from './bidPrivacy';
import { HIDDEN_CONTACT } from './privacy';

const bid = { status: 'PENDING', message: 'Звоните 8 917 444 55 66' };

describe('bidForCustomer', () => {
  it('hides contacts until the booking with this offer is confirmed', () => {
    expect(bidForCustomer(bid, null).message).toBe(`Звоните ${HIDDEN_CONTACT}`);
    expect(bidForCustomer({ ...bid, status: 'ACCEPTED' }, 'PENDING').message).toBe(
      `Звоните ${HIDDEN_CONTACT}`,
    );
    expect(bidForCustomer({ ...bid, status: 'REJECTED' }, 'CONFIRMED').message).toBe(
      `Звоните ${HIDDEN_CONTACT}`,
    );
  });

  it('shows the accepted offer in full once the booking is confirmed', () => {
    expect(bidForCustomer({ ...bid, status: 'ACCEPTED' }, 'CONFIRMED').message).toBe(bid.message);
    expect(bidForCustomer({ ...bid, message: null }, null).message).toBeNull();
  });
});

describe('bookedProviderSees', () => {
  const booking = (status: string) => ({ status, equipment: { companyId: 'a' } });
  it('opens the task text only to the booked company once confirmed', () => {
    expect(bookedProviderSees(booking('CONFIRMED'), 'a')).toBe(true);
    expect(bookedProviderSees(booking('PENDING'), 'a')).toBe(false);
    expect(bookedProviderSees(booking('CONFIRMED'), 'b')).toBe(false);
    expect(bookedProviderSees(null, 'a')).toBe(false);
    expect(bookedProviderSees(booking('ACTIVE'), null)).toBe(false);
  });
});
