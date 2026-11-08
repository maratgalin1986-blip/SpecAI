import { describe, expect, it } from 'vitest';
import { cleanInn, innLengthFor, isValidInn } from './inn';

describe('ИНН: контрольные цифры', () => {
  it('принимает верные ИНН организации (10) и ИП/физлица (12)', () => {
    expect(isValidInn('7707083893')).toBe(true);
    expect(isValidInn('500100732259')).toBe(true);
    expect(isValidInn('7707 08-38-93')).toBe(true);
  });

  it('отклоняет ошибку в одной цифре', () => {
    expect(isValidInn('7707083894')).toBe(false);
    expect(isValidInn('7707083883')).toBe(false);
    expect(isValidInn('500100732258')).toBe(false);
    expect(isValidInn('500100732269')).toBe(false);
  });

  it('отклоняет неверную длину, нули и не строки', () => {
    expect(isValidInn('77070838')).toBe(false);
    expect(isValidInn('77070838931')).toBe(false);
    expect(isValidInn('0000000000')).toBe(false);
    expect(isValidInn(7707083893)).toBe(false);
    expect(isValidInn(undefined)).toBe(false);
  });

  it('оставляет только цифры и знает длину по форме', () => {
    expect(cleanInn(' 77-07 ')).toBe('7707');
    expect(innLengthFor('LEGAL')).toBe(10);
    expect(innLengthFor('IP')).toBe(12);
    expect(innLengthFor('SELF')).toBe(12);
    expect(innLengthFor('PERSON')).toBe(12);
  });
});
