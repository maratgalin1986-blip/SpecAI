import { describe, expect, it } from 'vitest';
import {
  formatRuPhone,
  isQuickPlaceholderEmail,
  normalizeRuPhone,
  quickPlaceholderEmail,
  quickSignupSchema,
  signQuickLoginToken,
  verifyQuickLoginToken,
} from './quickProvider';

const SECRET = 'test-secret-test-secret';

describe('лёгкий вход исполнителя', () => {
  it('приводит телефон к 7XXXXXXXXXX и отклоняет не мобильные', () => {
    expect(normalizeRuPhone('8 (917) 000-00-00')).toBe('79170000000');
    expect(normalizeRuPhone('+7 917 000 00 00')).toBe('79170000000');
    expect(normalizeRuPhone('9170000000')).toBe('79170000000');
    expect(normalizeRuPhone('+7 843 000 00 00')).toBeNull();
    expect(normalizeRuPhone('12345')).toBeNull();
    expect(formatRuPhone('79170000000')).toBe('+7 917 000-00-00');
  });

  it('служебный e-mail на .invalid узнаётся', () => {
    const email = quickPlaceholderEmail('abc');
    expect(email.endsWith('.invalid')).toBe(true);
    expect(isQuickPlaceholderEmail(email)).toBe(true);
    expect(isQuickPlaceholderEmail('a@example.ru')).toBe(false);
  });

  it('требует оба согласия, имя, телефон и вид техники', () => {
    const ok = {
      name: 'Ильдар',
      phone: '89170000000',
      categoryId: 'c1',
      consent: true,
      publicConsent: true,
    };
    expect(quickSignupSchema.parse(ok).phone).toBe('79170000000');
    expect(quickSignupSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(quickSignupSchema.safeParse({ ...ok, publicConsent: undefined }).success).toBe(false);
    expect(quickSignupSchema.safeParse({ ...ok, phone: '123' }).success).toBe(false);
    expect(quickSignupSchema.safeParse({ ...ok, categoryId: '' }).success).toBe(false);
  });

  it('токен входа живёт 10 минут и не подходит как чужой токен', async () => {
    const now = 1_800_000_000;
    const token = await signQuickLoginToken('u1', { secret: SECRET, now });
    expect(await verifyQuickLoginToken(token, { secret: SECRET, now: now + 60 })).toBe('u1');
    expect(await verifyQuickLoginToken(token, { secret: SECRET, now: now + 11 * 60 })).toBeNull();
    expect(await verifyQuickLoginToken(token, { secret: 'other-secret-other', now })).toBeNull();
    expect(await verifyQuickLoginToken('junk', { secret: SECRET, now })).toBeNull();
    expect(await verifyQuickLoginToken(undefined, { secret: SECRET, now })).toBeNull();
  });
});
