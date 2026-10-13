import { describe, expect, it } from 'vitest';
import { adminMatches, phoneMatches, phoneNeedle } from './adminSearch';

describe('phoneNeedle', () => {
  it('drops the country prefix and needs at least 3 digits', () => {
    expect(phoneNeedle('+7 917 666')).toBe('917666');
    expect(phoneNeedle('8 917 666')).toBe('917666');
    expect(phoneNeedle('917-666')).toBe('917666');
    expect(phoneNeedle('77')).toBeNull();
    expect(phoneNeedle('Иван')).toBeNull();
    // An order id or an e-mail has digits but is not a phone.
    expect(phoneNeedle('cmv5hcjzv000fqdy3rnbnwphg')).toBeNull();
    expect(phoneNeedle('user123@example.com')).toBeNull();
  });
});

describe('phoneMatches', () => {
  it('compares any spelling of the same number', () => {
    expect(phoneMatches('+7 917 555-12-04', '89175551204')).toBe(true);
    expect(phoneMatches('8 (917) 555-12-04', '+7 917 555')).toBe(true);
    expect(phoneMatches('+79175551204', '555-12-04')).toBe(true);
    expect(phoneMatches('+79175551204', '666')).toBe(false);
    expect(phoneMatches(null, '917')).toBe(false);
  });
});

describe('adminMatches', () => {
  it('finds by a part of a name or a phone', () => {
    expect(adminMatches('анна', ['Анна Петрова'], [])).toBe(true);
    expect(adminMatches('917 555', ['Анна'], ['+7 917 555-12-04'])).toBe(true);
    expect(adminMatches('Пётр', ['Анна'], ['+7 917 555-12-04'])).toBe(false);
    expect(adminMatches('  ', ['Анна'])).toBe(false);
  });
});
