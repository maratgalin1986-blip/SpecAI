import { describe, expect, it } from 'vitest';
import { maskContactsAndLinks } from './privacy';
import {
  CHAT_ORDER_REMOVAL,
  CHAT_PHONE_REVEALS_PER_DAY,
  ERASED_ORDER_DATA,
  chatOrderNote,
  eraseBlockedByBooking,
  maskPhone,
  maskedContactFor,
  placeInText,
  revealDecision,
  revealNote,
  stripChatOrderNote,
  type RevealViewer,
} from './chatOrders';

describe('stripChatOrderNote', () => {
  it('drops the removal notice and keeps the request', () => {
    const text = `Нужен экскаватор в Бавлы завтра на 2 дня.\n\n${chatOrderNote('Стройчат Бавлы')}`;
    expect(stripChatOrderNote(text)).toBe('Нужен экскаватор в Бавлы завтра на 2 дня.');
    expect(stripChatOrderNote('Нужен кран на 3 дня')).toBe('Нужен кран на 3 дня');
  });
});

describe('placeInText', () => {
  it('finds a town after a preposition, in any form', () => {
    expect(placeInText('Нужен экскаватор в Бавлы завтра на 2 дня')).toBe('Бавлы');
    expect(placeInText('Срочно кран 25 т, г. Уруссу, звоните')).toBe('Уруссу');
    expect(placeInText('ищу погрузчик в Набережные Челны на неделю')).toBe('Набережные Челны');
    expect(placeInText('В Актаныше нужен бульдозер')).toBe('Актаныше');
  });

  it('ignores words that are not places', () => {
    expect(placeInText('сдаю экскаватор в Аренду, в Наличии два')).toBeNull();
    expect(placeInText('нужен кран в Понедельник, в Октябре')).toBeNull();
    expect(placeInText('нужен кран в казань')).toBeNull();
    expect(placeInText('')).toBeNull();
    expect(placeInText(null)).toBeNull();
  });
});

const PROVIDER: RevealViewer = {
  userId: 'u1',
  role: 'PROVIDER_ADMIN',
  companyId: 'c1',
  emailVerified: true,
};
const CHAT_ORDER = { source: 'TELEGRAM', status: 'OPEN', contactPhone: '+79171234567' };

function decide(overrides: Partial<Parameters<typeof revealDecision>[0]> = {}) {
  return revealDecision({
    viewer: PROVIDER,
    order: CHAT_ORDER,
    alreadyRevealed: false,
    revealsToday: 0,
    requireVerifiedEmail: true,
    ...overrides,
  });
}

describe('maskPhone', () => {
  it('keeps the code and the last two digits', () => {
    expect(maskPhone('+79171234567')).toBe('+7 917 •••-••-67');
    expect(maskPhone('8 (917) 123-45-67')).toBe('+7 917 •••-••-67');
    expect(maskPhone('+380501234567')).toBe('380•••••67');
    expect(maskPhone(null)).toBeNull();
  });

  it('never contains the hidden middle digits', () => {
    expect(maskPhone('+79171234567')).not.toContain('12345');
  });
});

describe('revealDecision', () => {
  it('lets a provider see the phone and counts it', () => {
    expect(decide()).toEqual({ ok: true, counts: true });
  });

  it('refuses guests and customers', () => {
    expect(decide({ viewer: null })).toMatchObject({ ok: false, status: 401 });
    expect(decide({ viewer: { ...PROVIDER, role: 'CUSTOMER' } })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(decide({ viewer: { ...PROVIDER, companyId: null } })).toMatchObject({ ok: false });
  });

  it('asks for a confirmed e-mail when the site sends letters', () => {
    const unverified = { ...PROVIDER, emailVerified: false };
    expect(decide({ viewer: unverified })).toMatchObject({ ok: false, status: 403 });
    expect(decide({ viewer: unverified, requireVerifiedEmail: false })).toMatchObject({ ok: true });
  });

  it('only for chat and guest orders that still have a phone', () => {
    // A guest order from the site keeps its phone in contactPhone too.
    expect(decide({ order: { ...CHAT_ORDER, source: 'SITE' } })).toEqual({
      ok: true,
      counts: true,
    });
    expect(decide({ order: { ...CHAT_ORDER, status: 'PENDING_REVIEW' } })).toMatchObject({
      status: 404,
    });
    expect(decide({ order: { ...CHAT_ORDER, status: 'CANCELLED' } })).toMatchObject({
      status: 410,
    });
    expect(decide({ order: { ...CHAT_ORDER, contactPhone: null } })).toMatchObject({
      status: 410,
    });
    expect(decide({ order: null })).toMatchObject({ status: 404 });
  });

  it('limits different orders per company a day, repeats are free', () => {
    expect(decide({ revealsToday: CHAT_PHONE_REVEALS_PER_DAY })).toMatchObject({
      ok: false,
      status: 429,
    });
    expect(decide({ revealsToday: CHAT_PHONE_REVEALS_PER_DAY, alreadyRevealed: true })).toEqual({
      ok: true,
      counts: false,
    });
  });
});

describe('chat order note and erasure', () => {
  it('says where the order was found', () => {
    expect(chatOrderNote('Стройка Челны')).toBe(
      'Заявка найдена в открытом чате «Стройка Челны». Автор может попросить удалить её — ' +
        'как это сделать, сказано на странице заявки.',
    );
    expect(chatOrderNote(undefined)).toMatch(/^Заявка найдена в открытом чате\. Автор может/);
    // The board masks contacts in descriptions, so the note itself carries none.
    expect(maskContactsAndLinks(chatOrderNote('Чат'))).toBe(chatOrderNote('Чат'));
    expect(CHAT_ORDER_REMOVAL).toContain('specplast16@mail.ru');
  });

  it('erases every personal field', () => {
    expect(ERASED_ORDER_DATA).toMatchObject({
      status: 'CANCELLED',
      contactName: null,
      contactPhone: null,
      rawText: null,
      sourceUrl: null,
      sourceChat: null,
    });
  });

  it('erases with a pending booking, refuses a confirmed or running one', () => {
    expect(eraseBlockedByBooking(null)).toBe(false);
    expect(eraseBlockedByBooking(undefined)).toBe(false);
    expect(eraseBlockedByBooking('PENDING')).toBe(false);
    expect(eraseBlockedByBooking('CANCELLED')).toBe(false);
    expect(eraseBlockedByBooking('COMPLETED')).toBe(false);
    expect(eraseBlockedByBooking('CONFIRMED')).toBe(true);
    expect(eraseBlockedByBooking('ACTIVE')).toBe(true);
  });
});

describe('masked contact of a chat or guest order', () => {
  const order = { contactPhone: '+79171234567' };

  it('is shown to other providers only, and only when there is a phone', () => {
    expect(maskedContactFor(order, { isProvider: true, isHouse: false })).toEqual({
      maskedPhone: '+7 917 •••-••-67',
      canReveal: true,
    });
    expect(maskedContactFor(order, { isProvider: false, isHouse: false })).toBeUndefined();
    expect(maskedContactFor(order, { isProvider: true, isHouse: true })).toBeUndefined();
    expect(
      maskedContactFor({ contactPhone: null }, { isProvider: true, isHouse: false }),
    ).toBeUndefined();
  });

  it('tells the provider how the author reached the service', () => {
    expect(revealNote('SITE')).toContain('на сайте');
    expect(revealNote('TELEGRAM')).toContain('открытый чат');
  });
});
