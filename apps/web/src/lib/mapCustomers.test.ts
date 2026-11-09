import { describe, expect, it } from 'vitest';
import { CUSTOMER_PIN_TITLE, toCustomerPins, type CustomerOrderRow } from './mapCustomers';

const order: CustomerOrderRow & Record<string, unknown> = {
  id: 'o1',
  category: { name: 'Экскаваторы' },
  customer: { name: 'Анна Петрова' },
  contactName: null,
  location: {
    latitude: 55.743612,
    longitude: 52.395987,
    city: 'Набережные Челны',
    addressLine: 'проспект Мира, 49, кв. 12',
  },
  // What a careless query might add: none of it may leave the server.
  description: 'Нужен экскаватор, звоните +7 927 111-22-33',
  contactPhone: '+79271112233',
  customerPhone: '+79271112233',
  createdAt: new Date('2026-11-01T10:00:00Z'),
};

describe('toCustomerPins', () => {
  it('shows «Заказчик рядом» with the short name and the machinery, never a phone or the address', () => {
    const [pin] = toCustomerPins([order]);
    expect(pin).toEqual({
      id: 'o1',
      lat: 55.74,
      lon: 52.4,
      title: CUSTOMER_PIN_TITLE,
      sub: 'нужно: Экскаваторы · Анна П.',
      machinery: 'Экскаваторы',
      customer: 'Анна П.',
      orderUrl: '/orders/o1',
      approximate: true,
    });
    const json = JSON.stringify(toCustomerPins([order]));
    expect(json).not.toContain('9271112233');
    expect(json).not.toContain('Мира');
    expect(json).not.toContain('Петрова');
    expect(json).not.toContain('2026-11-01');
  });

  it('rounds the point to about a kilometre', () => {
    const [pin] = toCustomerPins([order]);
    expect(pin?.lat).toBe(55.74);
    expect(pin?.lon).toBe(52.4);
  });

  it('places an order known by its city only at the city centre, and skips one without a place', () => {
    const [kazan] = toCustomerPins([
      { ...order, location: { latitude: null, longitude: null, city: 'Казань', addressLine: '' } },
    ]);
    expect(kazan).toMatchObject({ lat: 55.8, lon: 49.11 });
    expect(toCustomerPins([{ ...order, location: null }])).toEqual([]);
    expect(
      toCustomerPins([
        {
          ...order,
          location: { latitude: null, longitude: null, city: '', addressLine: 'где-то' },
        },
      ]),
    ).toEqual([]);
  });

  it('uses the chat author’s name shortened, and «любая техника» without a category', () => {
    const [pin] = toCustomerPins([
      {
        ...order,
        category: null,
        contactName: 'Марат Галин',
        customer: { name: 'Заявка из мессенджера' },
      },
    ]);
    expect(pin?.sub).toBe('нужно: любая техника · Марат Г.');
  });
});
