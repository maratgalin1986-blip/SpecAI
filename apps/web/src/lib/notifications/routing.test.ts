import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  ORDER_RADIUS_KM,
  acceptedCategoryIds,
  addressNamesCity,
  coveredByOwnerTelegram,
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

  it('keeps SMS short and never cuts the link', () => {
    const long = { ...message, title: 'Т'.repeat(300) };
    const sms = plainText(long, 'https://site.ru', 'sms');
    expect(sms.length).toBeLessThanOrEqual(140);
    expect(sms.endsWith('. https://site.ru/orders/o1')).toBe(true);
    expect(plainText(message, 'https://site.ru', 'sms')).toBe(
      'Новое предложение. https://site.ru/orders/o1',
    );
  });
});

describe('coveredByOwnerTelegram', () => {
  const owner: Recipient = { userId: 'owner', telegramChatId: '999' };
  const order = {
    type: 'order.new' as const,
    orderId: 'o1',
    description: 'x',
    startDate: new Date(),
  };

  it('skips Telegram for the owner on events lib/notify.ts already sent him', () => {
    expect(coveredByOwnerTelegram(order, owner, '999')).toBe(true);
    expect(coveredByOwnerTelegram(order, owner, ' 999 ')).toBe(true);
    expect(
      coveredByOwnerTelegram(
        { type: 'comment.pending', authorShortName: 'И.', about: 'о', text: 't' },
        owner,
        '999',
      ),
    ).toBe(true);
  });

  it('keeps every other recipient and every other event', () => {
    expect(coveredByOwnerTelegram(order, { ...owner, telegramChatId: '1' }, '999')).toBe(false);
    expect(coveredByOwnerTelegram(order, owner, null)).toBe(false);
    expect(coveredByOwnerTelegram(order, { userId: 'u' }, '999')).toBe(false);
    expect(
      coveredByOwnerTelegram(
        { type: 'bid.new', orderId: 'o1', equipmentName: 'JCB', price: '1 ₽' },
        owner,
        '999',
      ),
    ).toBe(false);
  });
});

describe('renderNotification: bookings, cancellations and bid updates', () => {
  const start = new Date('2026-12-01T06:00:00Z');

  it('tells the managers about a direct booking, with the short name only', () => {
    const message = renderNotification({
      type: 'booking.new',
      bookingId: 'b1',
      equipmentName: 'JCB 4CX',
      startDate: start,
      endDate: new Date('2026-12-02T06:00:00Z'),
      customerShortName: 'Анна П.',
    });
    expect(message.title).toBe('Новая бронь: JCB 4CX');
    expect(message.body).toContain('Анна П.');
    expect(message.body).toContain('01.12.2026 – 02.12.2026');
    expect(message.body).toContain('Подтвердите');
    expect(message.path).toBe('/provider#bookings');
  });

  it('tells a bidder that the customer cancelled the order', () => {
    const message = renderNotification({
      type: 'order.cancelled',
      orderId: 'o1',
      equipmentName: 'JCB 4CX',
      categoryName: 'Экскаваторы',
      startDate: start,
    });
    expect(message.title).toBe('Заявка отменена заказчиком');
    expect(message.body).toContain('JCB 4CX');
    expect(message.body).toContain('01.12.2026');
    expect(message.path).toBe('/orders');
  });

  it('marks an updated bid as such', () => {
    const base = {
      type: 'bid.new' as const,
      orderId: 'o1',
      equipmentName: 'JCB',
      price: '24 000 ₽',
    };
    expect(renderNotification(base).title).toBe('Новое предложение по вашей заявке');
    expect(renderNotification({ ...base, updated: true }).title).toBe(
      'Предложение по вашей заявке обновлено',
    );
  });

  it('tells the company that its machinist filled in the timesheet', () => {
    const base = {
      type: 'timesheet' as const,
      bookingId: 'b1',
      equipmentName: 'JCB',
      step: 'submitted' as const,
      hoursWorked: '6',
    };
    expect(renderNotification({ ...base, audience: 'provider' }).title).toBe(
      'Машинист заполнил табель — подтвердите',
    );
    expect(renderNotification({ ...base, audience: 'provider' }).path).toBe('/provider#bookings');
    expect(renderNotification({ ...base, audience: 'customer' }).title).toBe(
      'Табель смены ждёт подтверждения',
    );
  });

  it('says «найдена в открытом чате» once for a chat order', () => {
    const message = renderNotification({
      type: 'order.new',
      orderId: 'o1',
      description:
        'Нужен экскаватор в Бавлы завтра на 2 дня.\n\nЗаявка найдена в открытом чате «Стройчат». Автор может попросить удалить её — как это сделать, сказано на странице заявки.',
      categoryName: 'Экскаваторы',
      city: 'Бавлы',
      startDate: start,
      fromChat: true,
    });
    expect(message.body.match(/открытом чате/g)).toHaveLength(1);
    expect(message.body).not.toContain('Автор может');
    expect(message.body).toContain('Нужен экскаватор в Бавлы');
  });
});

describe('providerMatchesOrder', () => {
  const chelny = { lat: 55.74, lon: 52.4 };
  const kazan = { lat: 55.79, lon: 49.12 };
  const moscow = { lat: 55.75, lon: 37.62 };
  // A provider based in Chelny with machinery of the given categories.
  const based = (categoryIds: string[]) => ({
    categoryIds,
    baseLat: chelny.lat,
    baseLon: chelny.lon,
  });

  it('needs machinery of the order category', () => {
    expect(providerMatchesOrder(based(['exc']), { categoryId: 'exc', ...chelny })).toBe(true);
    expect(providerMatchesOrder(based(['crane']), { categoryId: 'exc', ...chelny })).toBe(false);
  });

  it('takes the accepted categories (family, group) when given', () => {
    const order = { categoryId: 'mini', categoryIds: ['mini', 'exc', 'earth'], ...chelny };
    expect(providerMatchesOrder(based(['exc']), order)).toBe(true);
    expect(providerMatchesOrder(based(['crane']), order)).toBe(false);
  });

  it('sends orders without a category to every provider with machinery', () => {
    expect(providerMatchesOrder(based(['crane']), { categoryId: null, ...chelny })).toBe(true);
    expect(providerMatchesOrder(based([]), { categoryId: null, ...chelny })).toBe(false);
  });

  it('keeps an order with an unknown place to the house and providers of that city', () => {
    const order = { categoryId: 'exc', city: 'Бавлы' };
    const kazanProvider = {
      categoryIds: ['exc'],
      baseLat: kazan.lat,
      baseLon: kazan.lon,
      baseAddress: 'Казань, ул. Тихая 1',
    };
    expect(providerMatchesOrder(kazanProvider, order)).toBe(false);
    expect(providerMatchesOrder({ categoryIds: ['exc'] }, order)).toBe(false);
    expect(
      providerMatchesOrder({ ...kazanProvider, baseAddress: 'г. Бавлы, промзона' }, order),
    ).toBe(true);
    expect(providerMatchesOrder({ ...kazanProvider, isHouse: true }, order)).toBe(true);
    expect(providerMatchesOrder({ ...kazanProvider, isHouse: true }, { categoryId: 'crane' })).toBe(
      false,
    );
  });

  it('limits by distance when both points are known', () => {
    expect(distanceKm(chelny, kazan)).toBeLessThan(ORDER_RADIUS_KM + 100);
    const provider = { categoryIds: ['exc'], baseLat: chelny.lat, baseLon: chelny.lon };
    expect(providerMatchesOrder(provider, { categoryId: 'exc', ...moscow })).toBe(false);
    expect(
      providerMatchesOrder(provider, { categoryId: 'exc', lat: 55.6, lon: 52.0 }), // ~30 km
    ).toBe(true);
  });

  it('never sends everything to a provider without base coordinates', () => {
    const noBase = { categoryIds: ['exc'], baseAddress: 'Набережные Челны, Промзона' };
    // No city text at all: nothing (it used to get every order in Russia).
    expect(providerMatchesOrder(noBase, { categoryId: 'exc', ...moscow })).toBe(false);
    expect(providerMatchesOrder({ categoryIds: ['exc'] }, { categoryId: 'exc', ...moscow })).toBe(
      false,
    );
    // Only orders whose city its base address names.
    expect(providerMatchesOrder(noBase, { categoryId: 'exc', ...moscow, city: 'Москва' })).toBe(
      false,
    );
    expect(
      providerMatchesOrder(noBase, { categoryId: 'exc', ...chelny, city: 'Набережные Челны' }),
    ).toBe(true);
    // The house company hears of everything regardless.
    expect(
      providerMatchesOrder(
        { categoryIds: ['exc'], isHouse: true },
        { categoryId: 'exc', ...moscow },
      ),
    ).toBe(true);
  });

  it("uses the company's own delivery radius when it has one", () => {
    const provider = { categoryIds: ['exc'], baseLat: chelny.lat, baseLon: chelny.lon };
    const site = { categoryId: 'exc', lat: 55.6, lon: 52.0 }; // ~30 km
    expect(providerMatchesOrder({ ...provider, radiusKm: 20 }, site)).toBe(false);
    expect(providerMatchesOrder({ ...provider, radiusKm: 50 }, site)).toBe(true);
    // Zero or null falls back to the default radius.
    expect(
      providerMatchesOrder({ ...provider, radiusKm: 0 }, { categoryId: 'exc', ...kazan }),
    ).toBe(distanceKm(chelny, kazan) <= ORDER_RADIUS_KM);
  });
});

describe('renderNotification: documents and the evening digest', () => {
  it('names the document and the days left', () => {
    const soon = renderNotification({
      type: 'document.expiring',
      title: 'СТС № 16 АА 123456 (JCB 4CX)',
      expiresAt: new Date('2026-11-07T00:00:00Z'),
      daysLeft: 30,
    });
    expect(soon.title).toBe('Документ истекает через 30 дн: СТС № 16 АА 123456 (JCB 4CX)');
    expect(soon.body).toContain('07.11.2026');
    expect(soon.path).toBe('/provider#documents');
    const today = renderNotification({
      type: 'document.expiring',
      title: 'ОСАГО',
      expiresAt: new Date('2026-10-08T00:00:00Z'),
      daysLeft: 0,
    });
    expect(today.title).toBe('Документ истёк: ОСАГО');
  });

  it("lists tomorrow's orders in one message", () => {
    const digest = renderNotification({
      type: 'digest.evening',
      items: ['экскаватор, Елабуга', 'кран, Набережные Челны +7 917 123-45-67'],
    });
    expect(digest.title).toBe('На завтра: 2 заявки');
    expect(digest.body).toContain('экскаватор, Елабуга; кран, Набережные Челны');
    expect(digest.body).not.toContain('123-45-67');
    expect(digest.path).toBe('/orders');
    expect(renderNotification({ type: 'digest.evening', items: ['a'] }).title).toBe(
      'На завтра: 1 заявка',
    );
  });

  it("reminds the customer about tomorrow's booking", () => {
    const reminder = renderNotification({
      type: 'booking.tomorrow',
      bookingId: 'b1',
      equipmentName: 'JCB 4CX',
      startDate: new Date('2026-10-09T00:00:00Z'),
      providerName: 'СпецПласт16',
    });
    expect(reminder.title).toBe('Завтра начало работ');
    expect(reminder.body).toContain('JCB 4CX · СпецПласт16');
    expect(reminder.path).toBe('/dashboard#bookings');
  });

  it("reminds the provider and the operator about tomorrow's booking", () => {
    const base = {
      type: 'booking.tomorrow' as const,
      bookingId: 'b1',
      equipmentName: 'JCB 4CX',
      startDate: new Date('2026-10-09T00:00:00Z'),
    };
    const provider = renderNotification({ ...base, audience: 'provider' });
    expect(provider.title).toBe('Завтра выезд на объект');
    expect(provider.path).toBe('/provider#bookings');
    const operator = renderNotification({ ...base, audience: 'operator' });
    expect(operator.body).toContain('Выехал');
    expect(operator.path).toBe('/dashboard#shifts');
  });
});

describe('renderNotification: a bid relayed to the house managers', () => {
  it('says whose order it is and asks to call', () => {
    const guest = renderNotification({
      type: 'bid.relay',
      orderId: 'o1',
      equipmentName: 'JCB 3CX',
      price: '28 000 ₽',
      companyName: 'ООО Ромашка',
      fromChat: false,
    });
    expect(guest.title).toBe('Предложение по заявке гостя с сайта');
    expect(guest.body).toContain('JCB 3CX · ООО Ромашка — 28 000 ₽');
    expect(guest.body).toContain('позвоните');
    expect(guest.path).toBe('/orders/o1');
  });
});

describe('acceptedCategoryIds', () => {
  const rows = [
    { id: 'earth', slug: 'earthmoving', parentId: null },
    { id: 'exc', slug: 'excavators', parentId: 'earth' },
    { id: 'wheel', slug: 'wheeled-excavators', parentId: 'earth' },
    { id: 'mini', slug: 'mini-excavators', parentId: 'earth' },
    { id: 'doz', slug: 'bulldozers', parentId: 'earth' },
    { id: 'lift', slug: 'lifting', parentId: null },
    { id: 'crane', slug: 'cranes', parentId: 'lift' },
  ];

  it('adds the excavator family and the group row, not other machines of the group', () => {
    expect(acceptedCategoryIds('wheel', rows)?.sort()).toEqual(['earth', 'exc', 'mini', 'wheel']);
    expect(acceptedCategoryIds('doz', rows)?.sort()).toEqual(['doz', 'earth']);
  });

  it('takes every category of a group for an order filed under the group', () => {
    expect(acceptedCategoryIds('lift', rows)?.sort()).toEqual(['crane', 'lift']);
  });

  it('keeps unknown ids and orders without a category as they are', () => {
    expect(acceptedCategoryIds('gone', rows)).toEqual(['gone']);
    expect(acceptedCategoryIds(null, rows)).toBeNull();
  });
});

describe('addressNamesCity', () => {
  it('finds the city in any case and form', () => {
    expect(addressNamesCity('г. Бавлы, ул. Ленина', 'Бавлы')).toBe(true);
    expect(addressNamesCity('Набережные Челны', 'Бавлы')).toBe(false);
    expect(addressNamesCity(null, 'Бавлы')).toBe(false);
  });
});
