import { describe, expect, it } from 'vitest';
import {
  canSeeCustomerContacts,
  customerForProvider,
  customerShortName,
  providerForCustomer,
} from './customerPrivacy';

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

describe('provider for the customer', () => {
  const company = { id: 'p1', name: 'ИП Иванов', phone: '+7 927 111-22-33' };
  it('shows the name always and the phone from CONFIRMED on', () => {
    expect(providerForCustomer(company, 'PENDING', 'house', '+7 000')).toEqual({
      name: 'ИП Иванов',
      phone: null,
    });
    expect(providerForCustomer(company, 'CONFIRMED', 'house', '+7 000').phone).toBe(
      '+7 927 111-22-33',
    );
  });
  it('falls back to the site phone for the own fleet only', () => {
    const house = { id: 'house', name: 'СпецПласт16', phone: null };
    expect(providerForCustomer(house, 'ACTIVE', 'house', '+7 000').phone).toBe('+7 000');
    expect(
      providerForCustomer({ ...house, id: 'x' }, 'ACTIVE', 'house', '+7 000').phone,
    ).toBeNull();
  });
});
