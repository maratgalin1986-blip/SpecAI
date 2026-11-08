import { describe, expect, it } from 'vitest';
import {
  prefillProposal,
  proposalBody,
  proposalContactUrl,
  proposalKindBadge,
  serverFieldErrors,
  validateProposal,
  type ProposalForm,
} from './proposals';

const valid: ProposalForm = {
  kind: 'IDEA',
  name: 'Иван',
  contact: '+7 900 000-00-00',
  company: '',
  message: 'Сделайте фильтр по городу на карте.',
  consent: true,
};

describe('the app’s proposal form', () => {
  it('passes a filled form', () => {
    expect(validateProposal(valid)).toEqual({});
    expect(
      validateProposal({ ...valid, kind: 'PARTNERSHIP', contact: 'test@example.com' }),
    ).toEqual({});
  });

  it('asks for a name', () => {
    expect(validateProposal({ ...valid, name: '  ' }).name).toBe('Как к вам обращаться?');
    expect(validateProposal({ ...valid, name: 'я'.repeat(101) }).name).toMatch(/100/);
  });

  it('asks for a phone or an e-mail', () => {
    for (const contact of ['', 'abc', '12345', 'Telegram @name', 'mail@site']) {
      expect(validateProposal({ ...valid, contact }).contact, contact).toMatch(/телефон.*e-mail/);
    }
    expect(validateProposal({ ...valid, contact: `${'a'.repeat(116)}@b.ru` }).contact).toMatch(
      /120/,
    );
  });

  it('asks for a message of 10–3000 characters', () => {
    expect(validateProposal({ ...valid, message: 'коротко' }).message).toMatch(/подробнее/);
    expect(validateProposal({ ...valid, message: 'а'.repeat(3001) }).message).toMatch(/3000/);
  });

  it('limits the company and needs the consent', () => {
    expect(validateProposal({ ...valid, company: 'к'.repeat(201) }).company).toMatch(/200/);
    expect(validateProposal({ ...valid, consent: false }).consent).toBe(
      'Нужно согласие на обработку персональных данных',
    );
  });

  it('sends trimmed fields, the company only when given, and the consent', () => {
    expect(proposalBody({ ...valid, name: ' Иван ', company: '  ' })).toEqual({
      kind: 'IDEA',
      name: 'Иван',
      contact: '+7 900 000-00-00',
      message: 'Сделайте фильтр по городу на карте.',
      consent: true,
    });
    expect(proposalBody({ ...valid, company: ' ООО Пример ' }).company).toBe('ООО Пример');
  });

  it('prefills the signed-in user, but not a technical guest address', () => {
    expect(prefillProposal({ name: 'Анна', email: 'anna@example.com' })).toEqual({
      name: 'Анна',
      contact: 'anna@example.com',
    });
    expect(prefillProposal({ name: 'Гость', email: 'guest-1@guest.invalid' }).contact).toBe('');
    expect(prefillProposal(null)).toEqual({ name: '', contact: '' });
  });

  it('shows the server’s field errors', () => {
    expect(
      serverFieldErrors({ error: 'x', fields: { contact: 'Укажите телефон', bad: 1 } }),
    ).toEqual({ contact: 'Укажите телефон' });
    expect(serverFieldErrors(null)).toEqual({});
    expect(serverFieldErrors({ error: 'Слишком много' })).toEqual({});
  });
});

describe('the admin’s proposal card', () => {
  it('links the contact for a one-tap answer', () => {
    expect(proposalContactUrl('test@example.com')).toBe('mailto:test@example.com');
    expect(proposalContactUrl('8 (900) 000-00-00')).toBe('tel:89000000000');
    expect(proposalContactUrl('javascript:alert(1)')).toBeNull();
  });

  it('labels the kind', () => {
    expect(proposalKindBadge('PARTNERSHIP')).toBe('Партнёрство');
    expect(proposalKindBadge('IDEA')).toBe('Идея');
  });
});
