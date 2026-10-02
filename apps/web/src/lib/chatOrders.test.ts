import { describe, expect, it } from 'vitest';
import {
  CHAT_PHONE_REVEALS_PER_DAY,
  ERASED_ORDER_DATA,
  chatOrderNote,
  maskPhone,
  revealDecision,
  type RevealViewer,
} from './chatOrders';

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

  it('only for chat orders that still have a phone', () => {
    expect(decide({ order: { ...CHAT_ORDER, source: 'SITE' } })).toMatchObject({ status: 404 });
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
      'Заявка найдена в открытом чате «Стройка Челны». Автор может попросить удалить её.',
    );
    expect(chatOrderNote(undefined)).toBe(
      'Заявка найдена в открытом чате. Автор может попросить удалить её.',
    );
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
});
