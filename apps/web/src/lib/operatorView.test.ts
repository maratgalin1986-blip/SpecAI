import { describe, expect, it } from 'vitest';
import { bookingForOperator, operatorCanCallSite, siteContactPhone } from './operatorView';

const booking = {
  id: 'b1',
  status: 'CONFIRMED',
  startDate: new Date('2026-10-08T00:00:00Z'),
  endDate: new Date('2026-10-09T00:00:00Z'),
  totalPrice: '24000',
  notes: 'Звоните прорабу +7 917 123-45-67',
  equipment: { id: 'm1', name: 'JCB 3CX', imageUrls: ['https://x.ru/a.jpg'], dailyRate: '24000' },
  customer: { id: 'u1', name: 'Анна Петрова', email: 'anna@example.com', phone: '+79170000000' },
  deliveryLocation: { addressLine: 'ул. Ленина, 1', city: 'Казань' },
};

describe('bookingForOperator', () => {
  it('keeps the machine, dates, address and the site phone of a confirmed booking', () => {
    const view = bookingForOperator(booking, (text) => text.replace(/\+?\d[\d -]{6,}\d/g, '***'));
    expect(view).toEqual({
      id: 'b1',
      status: 'CONFIRMED',
      startDate: booking.startDate,
      endDate: booking.endDate,
      equipment: { id: 'm1', name: 'JCB 3CX', imageUrls: ['https://x.ru/a.jpg'] },
      siteAddress: 'ул. Ленина, 1, Казань',
      contactPhone: '+79170000000',
      contactKind: 'customer',
      notes: 'Звоните прорабу ***',
    });
    // Never the price, the name or the e-mail.
    expect(JSON.stringify(view)).not.toMatch(/24000|Анна|anna@/);
  });

  it('hides the phone before confirmation and after completion', () => {
    expect(bookingForOperator({ ...booking, status: 'PENDING' }).contactPhone).toBeNull();
    expect(bookingForOperator({ ...booking, status: 'COMPLETED' }).contactPhone).toBeNull();
    expect(bookingForOperator({ ...booking, status: 'ACTIVE' }).contactPhone).toBe('+79170000000');
    expect(operatorCanCallSite('CANCELLED')).toBe(false);
  });

  it('takes the site address from the order when the booking has no delivery location', () => {
    const view = bookingForOperator({
      ...booking,
      deliveryLocation: null,
      order: { location: { addressLine: 'проспект Мира, 10', city: 'Набережные Челны' } },
    });
    expect(view.siteAddress).toBe('проспект Мира, 10, Набережные Челны');
    expect(
      bookingForOperator({ ...booking, order: { location: { addressLine: 'x', city: 'y' } } })
        .siteAddress,
    ).toBe('ул. Ленина, 1, Казань');
  });

  it('falls back to the order contact and then to the dispatcher when the customer has no phone', () => {
    // A chat or guest order: the technical customer account has no phone, the order has.
    const chat = bookingForOperator(
      { ...booking, customer: { phone: null }, order: { contactPhone: '+79175550606' } },
      (text) => text,
      '+7 (927) 242-80-88',
    );
    expect(chat.contactPhone).toBe('+79175550606');
    expect(chat.contactKind).toBe('order');
    // A signed-in customer who left no phone: the dispatcher's number.
    const noPhone = bookingForOperator(
      { ...booking, customer: { phone: '' }, order: null },
      (text) => text,
      '+7 (927) 242-80-88',
    );
    expect(noPhone.contactPhone).toBe('+7 (927) 242-80-88');
    expect(noPhone.contactKind).toBe('dispatcher');
    // Nothing known at all.
    expect(bookingForOperator({ ...booking, customer: null }).contactPhone).toBeNull();
    // Never before confirmation, whatever the source.
    expect(
      bookingForOperator(
        { ...booking, status: 'PENDING', order: { contactPhone: '+79175550606' } },
        (text) => text,
        '+7 (927) 242-80-88',
      ).contactPhone,
    ).toBeNull();
    expect(siteContactPhone({ customer: { phone: ' +79170000000 ' } })).toEqual({
      phone: '+79170000000',
      kind: 'customer',
    });
  });

  it('copes with a booking without a site or notes', () => {
    const view = bookingForOperator({
      ...booking,
      notes: null,
      deliveryLocation: null,
      customer: null,
      equipment: { id: 'm1', name: 'JCB' },
    });
    expect(view.siteAddress).toBeNull();
    expect(view.notes).toBeNull();
    expect(view.contactPhone).toBeNull();
    expect(view.equipment.imageUrls).toEqual([]);
  });
});
