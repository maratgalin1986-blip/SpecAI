import { describe, expect, it } from 'vitest';
import {
  canChangeProposalStatus,
  createProposalSchema,
  isProposalHoneypot,
  proposalContactHref,
  proposalFieldErrors,
  proposalTelegramText,
} from './proposals';

const valid = {
  kind: 'IDEA',
  name: 'Иван',
  contact: '+7 900 000-00-00',
  message: 'Сделайте фильтр по городу на карте.',
  consent: true,
};

function errorsOf(input: Record<string, unknown>) {
  const parsed = createProposalSchema.safeParse(input);
  return parsed.success ? {} : proposalFieldErrors(parsed.error);
}

describe('proposal validation', () => {
  it('accepts an idea and a partnership, company optional', () => {
    expect(createProposalSchema.safeParse(valid).success).toBe(true);
    const partner = createProposalSchema.parse({
      ...valid,
      kind: 'PARTNERSHIP',
      company: '  ООО Пример  ',
    });
    expect(partner.company).toBe('ООО Пример');
    expect(createProposalSchema.parse({ ...valid, company: '   ' }).company).toBeUndefined();
  });

  it('refuses another kind', () => {
    expect(errorsOf({ ...valid, kind: 'SPAM' }).kind).toBe('Выберите, что вы предлагаете');
    expect(errorsOf({ ...valid, kind: undefined }).kind).toBe('Выберите, что вы предлагаете');
  });

  it('needs a name of 1–100 characters', () => {
    expect(errorsOf({ ...valid, name: '   ' }).name).toBe('Как к вам обращаться?');
    expect(errorsOf({ ...valid, name: undefined }).name).toBe('Как к вам обращаться?');
    expect(errorsOf({ ...valid, name: 'я'.repeat(101) }).name).toMatch(/100/);
    expect(errorsOf({ ...valid, name: 'я'.repeat(100) }).name).toBeUndefined();
  });

  it('needs a phone or an e-mail of 5–120 characters', () => {
    for (const contact of ['test@example.com', '8 (927) 000-00-00', '+79270000000']) {
      expect(errorsOf({ ...valid, contact }).contact, contact).toBeUndefined();
    }
    for (const contact of ['', 'a@b', '12345', 'Telegram @name', '+7 900 000', 'mail@site']) {
      expect(errorsOf({ ...valid, contact }).contact, contact).toMatch(/телефон.*e-mail/);
    }
    expect(errorsOf({ ...valid, contact: `${'a'.repeat(116)}@b.ru` }).contact).toMatch(/120/);
  });

  it('needs a message of 10–3000 characters', () => {
    expect(errorsOf({ ...valid, message: 'коротко' }).message).toMatch(/подробнее/);
    expect(errorsOf({ ...valid, message: `   ${'а'.repeat(9)}   ` }).message).toMatch(/подробнее/);
    expect(errorsOf({ ...valid, message: 'а'.repeat(3001) }).message).toMatch(/3000/);
    expect(errorsOf({ ...valid, message: 'а'.repeat(3000) }).message).toBeUndefined();
  });

  it('limits the company to 200 characters', () => {
    expect(errorsOf({ ...valid, company: 'к'.repeat(201) }).company).toMatch(/200/);
  });

  it('needs the consent to personal data processing', () => {
    const message = 'Нужно согласие на обработку персональных данных';
    expect(errorsOf({ ...valid, consent: false }).consent).toBe(message);
    expect(errorsOf({ ...valid, consent: undefined }).consent).toBe(message);
    expect(errorsOf({ ...valid, consent: 'true' }).consent).toBe(message);
  });

  it('spots the honeypot', () => {
    expect(isProposalHoneypot({ ...valid, website: 'http://spam' })).toBe(true);
    expect(isProposalHoneypot({ ...valid, website: '' })).toBe(false);
    expect(isProposalHoneypot(valid)).toBe(false);
    expect(isProposalHoneypot(null)).toBe(false);
    // Any other filled value is a bot too, never a 400 that reveals the field.
    expect(isProposalHoneypot({ ...valid, website: 1 })).toBe(true);
    expect(isProposalHoneypot({ ...valid, website: true })).toBe(true);
    expect(isProposalHoneypot({ ...valid, website: null })).toBe(false);
  });
});

describe('proposal status changes', () => {
  it('goes NEW → READ → ARCHIVED and never back', () => {
    expect(canChangeProposalStatus('NEW', 'READ')).toBe(true);
    expect(canChangeProposalStatus('NEW', 'ARCHIVED')).toBe(true);
    expect(canChangeProposalStatus('READ', 'ARCHIVED')).toBe(true);
    expect(canChangeProposalStatus('READ', 'READ')).toBe(false);
    expect(canChangeProposalStatus('ARCHIVED', 'READ')).toBe(false);
    expect(canChangeProposalStatus('ARCHIVED', 'ARCHIVED')).toBe(false);
    expect(canChangeProposalStatus('WHATEVER', 'READ')).toBe(false);
  });
});

describe('the owner’s Telegram note', () => {
  it('has the kind, name, contact and the first 300 characters only', () => {
    const text = proposalTelegramText(
      {
        kind: 'PARTNERSHIP',
        name: 'Иван',
        contact: 'test@example.com',
        message: `${'а'.repeat(300)}ХВОСТ`,
      },
      'https://example.test/admin#proposals',
    );
    expect(text).toContain('Сотрудничество и партнёрство');
    expect(text).toContain('Имя: Иван');
    expect(text).toContain('Контакт: test@example.com');
    expect(text).toContain(`${'а'.repeat(300)}…`);
    expect(text).not.toContain('ХВОСТ');
    expect(text).toContain('https://example.test/admin#proposals');
  });

  it('never cuts an emoji in half', () => {
    const text = proposalTelegramText(
      { kind: 'IDEA', name: 'Анна', contact: '+79000000000', message: `${'а'.repeat(299)}🚜🚜` },
      'https://example.test/admin#proposals',
    );
    expect(text).toContain(`${'а'.repeat(299)}🚜…`);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('keeps a short message whole', () => {
    const text = proposalTelegramText(
      { kind: 'IDEA', name: 'Анна', contact: '+79000000000', message: 'Добавьте тёмную тему.' },
      'https://example.test/admin#proposals',
    );
    expect(text).toContain('Идея или предложение по сервису');
    expect(text).toContain('Добавьте тёмную тему.');
    expect(text).not.toContain('…');
  });
});

describe('contact links in the admin area', () => {
  it('makes tel: and mailto: links', () => {
    expect(proposalContactHref('test@example.com')).toBe('mailto:test@example.com');
    expect(proposalContactHref('+7 (900) 000-00-00')).toBe('tel:+79000000000');
    expect(proposalContactHref('javascript:alert(1)')).toBeNull();
  });
});
