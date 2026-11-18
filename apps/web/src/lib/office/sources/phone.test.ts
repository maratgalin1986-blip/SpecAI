import { describe, expect, it } from 'vitest';
import { candidateEmail, emailRank } from './phone';

describe('candidateEmail — адрес руководителя или закупок предпочтительнее общего', () => {
  it('один адрес — он; не адрес — null', () => {
    expect(candidateEmail('Info@Firma.RU')).toBe('info@firma.ru');
    expect(candidateEmail('mailto:a@b.ru')).toBe('a@b.ru');
    expect(candidateEmail('нет')).toBeNull();
    expect(candidateEmail(null)).toBeNull();
  });

  it('из нескольких берётся адрес директора, потом закупок и продаж, потом личный, потом общий', () => {
    expect(candidateEmail('info@firma.ru; director@firma.ru')).toBe('director@firma.ru');
    expect(candidateEmail('info@firma.ru, zakup@firma.ru')).toBe('zakup@firma.ru');
    expect(candidateEmail('info@firma.ru;ivan.petrov@firma.ru')).toBe('ivan.petrov@firma.ru');
    expect(candidateEmail('support@firma.ru;info@firma.ru')).toBe('info@firma.ru');
    expect(candidateEmail('director@firma.ru;zakup@firma.ru')).toBe('director@firma.ru');
  });

  it('при равных адресах — первый', () => {
    expect(candidateEmail('a1@firma.ru;b2@firma.ru')).toBe('a1@firma.ru');
  });

  it('emailRank: порядок «директор > закупки > личный > общий > служебный»', () => {
    const order = ['gendir@f.ru', 'snab@f.ru', 'oleg.ivanov@f.ru', 'info@f.ru', 'support@f.ru'];
    const ranks = order.map(emailRank);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });
});
