import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  ORDER_RADIUS_KM,
  distanceKm,
  phoneDigits,
  pickChannels,
  plainText,
  prefsFrom,
  providerMatchesOrder,
  renderNotification,
  type Recipient,
  type ServerChannels,
} from './routing';

const ALL_ON: ServerChannels = {
  telegram: true,
  push: true,
  email: true,
  whatsapp: true,
  sms: true,
};
const FREE_ONLY: ServerChannels = { ...ALL_ON, whatsapp: false, sms: false };

const FULL: Recipient = {
  userId: 'u1',
  email: 'anna@example.com',
  phone: '8 (917) 123-45-67',
  telegramChatId: '12345',
  pushTokens: ['ExponentPushToken[abc]'],
};

describe('prefsFrom', () => {
  it('uses the defaults without a saved row', () => {
    expect(prefsFrom(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({
      telegram: true,
      push: true,
      email: true,
      whatsapp: false,
      sms: false,
    });
  });

  it('takes stored booleans and ignores everything else', () => {
    expect(prefsFrom({ email: false, sms: true })).toEqual({
      ...DEFAULT_PREFS,
      email: false,
      sms: true,
    });
  });
});

describe('pickChannels', () => {
  it('sends over every chosen channel that can reach the user', () => {
    expect(pickChannels(DEFAULT_PREFS, FULL, ALL_ON)).toEqual(['telegram', 'push', 'email']);
  });

  it('respects unticked boxes', () => {
    expect(pickChannels({ ...DEFAULT_PREFS, email: false, push: false }, FULL, ALL_ON)).toEqual([
      'telegram',
    ]);
  });

  it('skips Telegram until the chat is linked and push without devices', () => {
    const recipient = { ...FULL, telegramChatId: null, pushTokens: [] };
    expect(pickChannels(DEFAULT_PREFS, recipient, ALL_ON)).toEqual(['email']);
  });

  it('never e-mails technical .invalid accounts', () => {
    const importer = { userId: 'x', email: 'imported-orders@specplast16.invalid' };
    expect(pickChannels(DEFAULT_PREFS, importer, ALL_ON)).toEqual([]);
  });

  it('keeps WhatsApp and SMS off while the server adapter is not set up («скоро»)', () => {
    const prefs = { ...DEFAULT_PREFS, whatsapp: true, sms: true };
    expect(pickChannels(prefs, FULL, FREE_ONLY)).toEqual(['telegram', 'push', 'email']);
    expect(pickChannels(prefs, FULL, ALL_ON)).toEqual([
      'telegram',
      'push',
      'email',
      'whatsapp',
      'sms',
    ]);
  });

  it('needs a phone for WhatsApp and SMS', () => {
    const prefs = { ...DEFAULT_PREFS, whatsapp: true, sms: true };
    expect(pickChannels(prefs, { ...FULL, phone: 'Telegram @ivan' }, ALL_ON)).not.toContain('sms');
  });

  it('skips e-mail when Resend is not configured', () => {
    expect(pickChannels(DEFAULT_PREFS, FULL, { ...ALL_ON, email: false })).toEqual([
      'telegram',
      'push',
    ]);
  });
});

describe('phoneDigits', () => {
  it('normalises Russian numbers to 7XXXXXXXXXX', () => {
    expect(phoneDigits('8 (917) 123-45-67')).toBe('79171234567');
    expect(phoneDigits('+7 917 123 45 67')).toBe('79171234567');
    expect(phoneDigits('9171234567')).toBe('79171234567');
    expect(phoneDigits('123')).toBeNull();
    expect(phoneDigits(null)).toBeNull();
  });
});

describe('renderNotification', () => {
  const start = new Date('2026-10-05T06:00:00Z');

  it('masks contacts in an order description sent to providers', () => {
    const message = renderNotification({
      type: 'order.new',
      orderId: 'o1',
      description: 'Нужен экскаватор, звоните +7 917 123-45-67 или @ivan_petrov',
      categoryName: 'Экскаваторы',
      city: 'Набережные Челны',
      startDate: start,
      fromChat: true,
    });
    expect(message.title).toBe('Новая заявка: Экскаваторы, Набережные Челны');
    expect(message.body).not.toContain('917');
    expect(message.body).not.toContain('ivan_petrov');
    expect(message.body).toContain('открытом чате');
    expect(message.path).toBe('/orders/o1');
  });

  it('shows the provider only the short customer name', () => {
    const message = renderNotification({
      type: 'bid.accepted',
      bookingId: 'b1',
      equipmentName: 'JCB 4CX',
      price: '12 000 ₽',
      startDate: start,
      customerShortName: 'Анна П.',
    });
    expect(message.body).toContain('Анна П.');
    expect(message.path).toBe('/provider#bookings');
  });

  it('tells each side about a booking status in its own words', () => {
    const base = {
      type: 'booking.status' as const,
      bookingId: 'b1',
      equipmentName: 'JCB 4CX',
      status: 'CANCELLED' as const,
      startDate: start,
    };
    expect(renderNotification({ ...base, audience: 'provider' }).body).toContain(
      'Заказчик отменил',
    );
    const toCustomer = renderNotification({ ...base, status: 'CONFIRMED', audience: 'customer' });
    expect(toCustomer.title).toBe('Бронь подтверждена');
    expect(toCustomer.path).toBe('/dashboard#bookings');
  });

  it('points admins to moderation', () => {
    const message = renderNotification({
      type: 'comment.pending',
      authorShortName: 'Иван П.',
      about: 'об исполнителе «Ромашка»',
      text: 'Отличная работа, пишите на mail@example.com',
    });
    expect(message.path).toBe('/admin#comments');
    expect(message.body).not.toContain('mail@example.com');
  });
});

describe('plainText', () => {
  const message = { title: 'Новое предложение', body: 'JCB — 10 000 ₽', path: '/orders/o1' };

  it('adds the link for messengers', () => {
    expect(plainText(message, 'https://site.ru/', 'telegram')).toBe(
      'Новое предложение\nJCB — 10 000 ₽\nhttps://site.ru/orders/o1',
    );
  });

  it('keeps SMS short', () => {
    const long = { ...message, title: 'Т'.repeat(300) };
    expect(plainText(long, 'https://site.ru', 'sms').length).toBeLessThanOrEqual(140);
  });
});

describe('providerMatchesOrder', () => {
  const chelny = { lat: 55.74, lon: 52.4 };
  const kazan = { lat: 55.79, lon: 49.12 };
  const moscow = { lat: 55.75, lon: 37.62 };

  it('needs machinery of the order category', () => {
    expect(providerMatchesOrder({ categoryIds: ['exc'] }, { categoryId: 'exc' })).toBe(true);
    expect(providerMatchesOrder({ categoryIds: ['crane'] }, { categoryId: 'exc' })).toBe(false);
  });

  it('sends orders without a category to every provider with machinery', () => {
    expect(providerMatchesOrder({ categoryIds: ['crane'] }, { categoryId: null })).toBe(true);
    expect(providerMatchesOrder({ categoryIds: [] }, { categoryId: null })).toBe(false);
  });

  it('limits by distance when both points are known', () => {
    expect(distanceKm(chelny, kazan)).toBeLessThan(ORDER_RADIUS_KM + 100);
    const provider = { categoryIds: ['exc'], baseLat: chelny.lat, baseLon: chelny.lon };
    expect(providerMatchesOrder(provider, { categoryId: 'exc', ...moscow })).toBe(false);
    expect(
      providerMatchesOrder(provider, { categoryId: 'exc', lat: 55.6, lon: 52.0 }), // ~30 km
    ).toBe(true);
    // Unknown base or site: not filtered out.
    expect(providerMatchesOrder({ categoryIds: ['exc'] }, { categoryId: 'exc', ...moscow })).toBe(
      true,
    );
  });
});
