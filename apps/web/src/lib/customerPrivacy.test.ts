import { describe, expect, it } from 'vitest';
import { canSeeCustomerContacts, customerForProvider, customerShortName } from './customerPrivacy';

const customer = {
  id: 'u1',
  name: 'Анна Петрова',
  email: 'anna@example.ru',
  phone: '+7 900 000-00-00',
};

describe('customer privacy for providers', () => {
  it('shortens the name to the first name and an initial', () => {
    expect(customerShortName('Анна Петрова')).toBe('Анна П.');
    expect(customerShortName('анна')).toBe('Анна');
    expect(customerShortName('anna@example.ru')).toBe('Заказчик');
    expect(customerShortName('')).toBe('Заказчик');
  });

  it('shows contacts only once the booking is confirmed', () => {
    expect(canSeeCustomerContacts('PENDING')).toBe(false);
    expect(canSeeCustomerContacts('CANCELLED')).toBe(false);
    for (const status of ['CONFIRMED', 'ACTIVE', 'COMPLETED']) {
      expect(canSeeCustomerContacts(status)).toBe(true);
    }
  });

  it('hides the phone and e-mail of a pending booking', () => {
    expect(customerForProvider(customer, 'PENDING')).toEqual({
      id: 'u1',
      name: 'Анна П.',
      email: null,
      phone: null,
      contactsVisible: false,
    });
    expect(customerForProvider(customer, 'CONFIRMED')).toMatchObject({
      name: 'Анна П.',
      email: 'anna@example.ru',
      phone: '+7 900 000-00-00',
      contactsVisible: true,
    });
    expect(JSON.stringify(customerForProvider(customer, 'CANCELLED'))).not.toContain('Петрова');
  });
});
