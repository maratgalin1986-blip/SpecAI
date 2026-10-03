import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bidAccepted,
  bookingStatusChanged,
  emailVerify,
  newBidReceived,
  passwordReset,
  paymentReceived,
} from './emailTemplates';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://specai.example.com/';
  delete process.env.NEXTAUTH_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('newBidReceived', () => {
  it('builds a Russian subject, order link and price', () => {
    const tpl = newBidReceived({
      orderId: 'ord_1',
      orderDescription: 'Нужен экскаватор',
      equipmentName: 'JCB 3CX',
      price: { toString: () => '15000.50' },
      currency: 'RUB',
      message: 'Готовы <сразу>',
    });
    expect(tpl.subject).toContain('цена по заявке');
    expect(tpl.subject).toContain('JCB 3CX');
    expect(tpl.html).toContain('https://specai.example.com/orders/ord_1');
    expect(tpl.text).toContain('https://specai.example.com/orders/ord_1');
    expect(tpl.text).toContain('RUB');
    expect(tpl.html).toContain('Нужен экскаватор');
    // user-provided text is escaped in HTML
    expect(tpl.html).toContain('Готовы &lt;сразу&gt;');
    expect(tpl.html).not.toContain('<сразу>');
  });
});

describe('bidAccepted', () => {
  it('addresses the provider and falls back to NEXTAUTH_URL', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    const tpl = bidAccepted({
      bookingId: 'bk_1',
      equipmentName: 'Кран Liebherr',
      price: 200000,
      currency: 'RUB',
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-05T00:00:00Z'),
      customerName: 'Иван',
    });
    expect(tpl.subject).toContain('предложение принято');
    expect(tpl.text).toContain('Иван');
    expect(tpl.text).toContain('бронирование');
    expect(tpl.text).toContain('01.10.2026');
    expect(tpl.html).toContain('http://localhost:3000/dashboard');
  });
});

describe('bookingStatusChanged', () => {
  it('translates the status into Russian', () => {
    const tpl = bookingStatusChanged({
      bookingId: 'bk_2',
      equipmentName: 'Самосвал',
      status: 'CANCELLED',
      startDate: '2026-11-01T00:00:00Z',
      endDate: '2026-11-03T00:00:00Z',
    });
    expect(tpl.subject).toContain('отменено');
    expect(tpl.html).toContain('отменено');
    expect(tpl.text).toContain('bk_2');
  });
});

describe('paymentReceived', () => {
  it('produces different copy for customer and provider', () => {
    const base = { bookingId: 'bk_3', equipmentName: 'Бульдозер', amount: 5000, currency: 'USD' };
    const customer = paymentReceived({ ...base, recipient: 'customer' });
    const provider = paymentReceived({ ...base, recipient: 'provider' });
    expect(customer.subject).toContain('оплата получена');
    expect(customer.text).toContain('вашу оплату');
    expect(provider.text).toContain('Клиент оплатил');
    expect(provider.text).toContain('USD');
    expect(customer.html).toContain('https://specai.example.com/dashboard');
  });
});

describe('passwordReset', () => {
  it('links to the reset url in html and text', () => {
    const url = 'https://specai.example.com/reset-password?token=abc&x=1';
    const tpl = passwordReset({ resetUrl: url });
    expect(tpl.subject).toContain('сброс пароля');
    expect(tpl.html).toContain('https://specai.example.com/reset-password?token=abc&amp;x=1');
    expect(tpl.text).toContain(url);
    expect(tpl.text).toContain('1 час');
  });
});

describe('emailVerify', () => {
  it('links to the verify url and mentions the 24h ttl', () => {
    const url = 'https://specai.example.com/verify-email?token=xyz';
    const tpl = emailVerify({ verifyUrl: url });
    expect(tpl.subject).toContain('подтвердите email');
    expect(tpl.html).toContain(url);
    expect(tpl.text).toContain(url);
    expect(tpl.text).toContain('24 часа');
  });
});
