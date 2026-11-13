import { describe, expect, it } from 'vitest';
import { createLeadSchema } from '@specai/shared';
import { formatPhone, PHONE_ERRORS, phoneError } from './phoneMask';

/** Types the text one character at a time, as a visitor would. */
function type(text: string): string {
  let value = '';
  for (const ch of text) value = formatPhone(value + ch, value);
  return value;
}

describe('formatPhone', () => {
  it('formats a number typed with 8, with 9 and with +7', () => {
    expect(type('89271234567')).toBe('+7 (927) 123-45-67');
    expect(type('9271234567')).toBe('+7 (927) 123-45-67');
    expect(type('+79271234567')).toBe('+7 (927) 123-45-67');
    expect(type('79271234567')).toBe('+7 (927) 123-45-67');
  });

  it('formats a pasted number in any writing', () => {
    expect(formatPhone('8 (927) 123-45-67')).toBe('+7 (927) 123-45-67');
    expect(formatPhone('+7 927 123 45 67')).toBe('+7 (927) 123-45-67');
    expect(formatPhone('  7-927-123-45-67 ')).toBe('+7 (927) 123-45-67');
    expect(formatPhone('927.123.45.67')).toBe('+7 (927) 123-45-67');
  });

  it('keeps a city code that starts with 8 (8552 — Набережные Челны)', () => {
    expect(type('8552123456')).toBe('+7 (855) 212-34-56');
    expect(type('88552123456')).toBe('+7 (855) 212-34-56');
    expect(type('8432123456')).toBe('+7 (843) 212-34-56');
  });

  it('shows the number as it grows', () => {
    expect(type('9')).toBe('+7 (9');
    expect(type('927')).toBe('+7 (927');
    expect(type('9271')).toBe('+7 (927) 1');
    expect(type('9271234')).toBe('+7 (927) 123-4');
    expect(type('927123456')).toBe('+7 (927) 123-45-6');
  });

  it('drops digits past the tenth', () => {
    expect(type('92712345678999')).toBe('+7 (927) 123-45-67');
  });

  it('a backspace over a separator removes the digit before it', () => {
    // «+7 (927) 1» → backspace → «+7 (927) » would re-format to the same text.
    expect(formatPhone('+7 (927) ', '+7 (927) 1')).toBe('+7 (927');
    expect(formatPhone('+7 (927', '+7 (927) 1')).toBe('+7 (927');
    expect(formatPhone('+7 (927) 123-', '+7 (927) 123-4')).toBe('+7 (927) 123');
    // …and the field can be emptied with backspaces alone.
    let value = '+7 (927) 123-45-67';
    for (let i = 0; i < 30 && value; i += 1) value = formatPhone(value.slice(0, -1), value);
    expect(value).toBe('');
  });

  it('leaves another country code as typed', () => {
    expect(type('+375291234567')).toBe('+375291234567');
    expect(formatPhone('+')).toBe('+');
    expect(formatPhone('')).toBe('');
    expect(formatPhone('abc')).toBe('');
  });
});

describe('phoneError', () => {
  it('names an empty, a short and a long number', () => {
    expect(phoneError('')).toBe(PHONE_ERRORS.empty);
    expect(phoneError('+7 (')).toBe(PHONE_ERRORS.short);
    expect(phoneError('+7 (927) 123-45')).toBe(PHONE_ERRORS.short);
    expect(phoneError('+7 (927) 123-45-6')).toBe(PHONE_ERRORS.short);
    expect(phoneError('+1234567890123456')).toBe(PHONE_ERRORS.long);
  });

  it('accepts what the mask produces and a foreign number', () => {
    expect(phoneError('+7 (927) 123-45-67')).toBeNull();
    expect(phoneError('+375291234567')).toBeNull();
  });

  it('what passes here passes the API schema', () => {
    for (const typed of ['89271234567', '9271234567', '+79271234567', '8552123456']) {
      const phone = type(typed);
      expect(phoneError(phone)).toBeNull();
      expect(createLeadSchema.safeParse({ phone, consent: true }).success).toBe(true);
    }
  });
});
