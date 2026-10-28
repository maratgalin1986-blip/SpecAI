import { describe, expect, it } from 'vitest';
import {
  canDecide,
  canSubmitVerification,
  decisionData,
  fullRegistrationSchema,
  maskAccount,
  shouldOfferFullRegistration,
  trustLabel,
  verificationStatus,
} from './providerVerification';
import { reliability, EMPTY_STATS, PROVISIONAL_BADGE } from './reliability';

const quick = { verified: false, provisional: true };

describe('статус проверки исполнителя', () => {
  it('лёгкий вход → provisional; отправлено → pending; вернули → rejected; одобрено → verified', () => {
    expect(verificationStatus(quick)).toBe('provisional');
    expect(verificationStatus({ verified: false })).toBe('unverified');
    expect(verificationStatus({ ...quick, verificationRequestedAt: new Date() })).toBe('pending');
    expect(
      verificationStatus({ ...quick, verificationRejectedReason: 'Фото СТС не читается' }),
    ).toBe('rejected');
    expect(verificationStatus({ ...quick, verified: true })).toBe('verified');
  });

  it('проходит переходы provisional → pending → verified через решения админа', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    let company: Parameters<typeof verificationStatus>[0] = { ...quick };
    expect(canSubmitVerification(verificationStatus(company))).toBe(true);
    company = { ...company, verificationRequestedAt: now };
    expect(canSubmitVerification(verificationStatus(company))).toBe(false);
    expect(canDecide('pending', 'reject')).toBe(true);
    company = { ...company, ...decisionData({ action: 'reject', reason: 'Нет фото' }, now) };
    expect(verificationStatus(company)).toBe('rejected');
    expect(canSubmitVerification('rejected')).toBe(true);
    company = { ...company, verificationRequestedAt: now, verificationRejectedReason: null };
    expect(canDecide(verificationStatus(company), 'approve')).toBe(true);
    company = { ...company, ...decisionData({ action: 'approve' }, now) };
    expect(verificationStatus(company)).toBe('verified');
    expect(company.provisional).toBe(false);
    expect(canSubmitVerification('verified')).toBe(false);
    expect(canDecide('verified', 'approve')).toBe(false);
    expect(canDecide('verified', 'revoke')).toBe(true);
    expect(canDecide('provisional', 'reject')).toBe(false);
    expect(canDecide('pending', 'revoke')).toBe(false);
  });

  it('«Проверен» только после одобрения, лёгкий вход — честная пометка', () => {
    expect(trustLabel(quick)).toBe('Новый исполнитель, данные не проверены');
    expect(trustLabel({ ...quick, verificationRequestedAt: new Date() })).toBe(
      'Новый исполнитель, данные не проверены',
    );
    expect(trustLabel({ verified: false })).toBeNull();
    expect(trustLabel({ verified: true, provisional: false })).toBe('Проверен');
    const chips = reliability({ ...EMPTY_STATS, provisional: true }).badges;
    expect(chips).toContain(PROVISIONAL_BADGE);
    expect(chips).not.toContain('Проверен');
    expect(reliability({ ...EMPTY_STATS, provisional: true, verified: true }).badges).toContain(
      'Проверен',
    );
  });

  it('предлагает «Завершите регистрацию» только после первого подтверждённого заказа', () => {
    expect(shouldOfferFullRegistration(quick, 0)).toBe(false);
    expect(shouldOfferFullRegistration(quick, 1)).toBe(true);
    expect(shouldOfferFullRegistration({ verified: false }, 2)).toBe(true);
    expect(shouldOfferFullRegistration({ ...quick, verificationRequestedAt: new Date() }, 3)).toBe(
      false,
    );
    expect(shouldOfferFullRegistration({ verified: true }, 3)).toBe(false);
    expect(shouldOfferFullRegistration({ ...quick, verificationRejectedReason: 'x' }, 0)).toBe(
      true,
    );
  });
});

describe('форма полной регистрации', () => {
  const base = {
    legalForm: 'IP',
    legalName: 'Петров Пётр Петрович',
    inn: '500100732259',
    taxRegime: 'USN',
    stsNumber: '16 49 123456',
    stsFileKey: 'private/verification/c1/abc-sts.jpg',
  };

  it('принимает ИП на УСН и чистит номера', () => {
    const parsed = fullRegistrationSchema.parse({ ...base, bankBik: '049 205 603' });
    expect(parsed.inn).toBe('500100732259');
    expect(parsed.bankBik).toBe('049205603');
    expect(parsed.stsNumber).toBe('16 49 123456');
  });

  it('отклоняет ИНН с неверной контрольной суммой и неверной длины для формы', () => {
    expect(fullRegistrationSchema.safeParse({ ...base, inn: '500100732258' }).success).toBe(false);
    expect(
      fullRegistrationSchema.safeParse({ ...base, legalForm: 'LEGAL', inn: '500100732259' })
        .success,
    ).toBe(false);
    expect(
      fullRegistrationSchema.safeParse({
        ...base,
        legalForm: 'LEGAL',
        inn: '7707083893',
        taxRegime: 'OSNO_VAT',
      }).success,
    ).toBe(true);
  });

  it('проверяет режим по форме: самозанятый — только НПД, физлицо — без режима', () => {
    expect(
      fullRegistrationSchema.safeParse({ ...base, legalForm: 'SELF', taxRegime: 'USN' }).success,
    ).toBe(false);
    expect(
      fullRegistrationSchema.safeParse({ ...base, legalForm: 'SELF', taxRegime: 'NPD' }).success,
    ).toBe(true);
    expect(
      fullRegistrationSchema.safeParse({ ...base, legalForm: 'PERSON', taxRegime: null }).success,
    ).toBe(true);
    expect(
      fullRegistrationSchema.safeParse({
        ...base,
        legalForm: 'LEGAL',
        inn: '7707083893',
        taxRegime: 'PATENT',
      }).success,
    ).toBe(false);
  });

  it('требует СТС и фото, проверяет банк', () => {
    expect(fullRegistrationSchema.safeParse({ ...base, stsNumber: '' }).success).toBe(false);
    expect(fullRegistrationSchema.safeParse({ ...base, stsFileKey: '' }).success).toBe(false);
    expect(fullRegistrationSchema.safeParse({ ...base, bankAccount: '123' }).success).toBe(false);
    expect(maskAccount('40702810000000001234')).toBe('•••• 1234');
    expect(maskAccount(null)).toBeNull();
  });
});
