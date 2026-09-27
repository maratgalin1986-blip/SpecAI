import { describe, expect, it } from 'vitest';
import { isZeroDecimalCurrency, toStripeAmount } from './stripeAmount';

describe('toStripeAmount', () => {
  it('converts two-decimal currencies to minor units', () => {
    expect(toStripeAmount(12.34, 'USD')).toBe(1234);
    expect(toStripeAmount('1500.00', 'eur')).toBe(150000);
    expect(toStripeAmount(0.1 + 0.2, 'RUB')).toBe(30);
  });

  it('keeps zero-decimal currencies as whole units', () => {
    expect(isZeroDecimalCurrency('jpy')).toBe(true);
    expect(toStripeAmount(500, 'JPY')).toBe(500);
    expect(toStripeAmount({ toString: () => '1234.56' }, 'KRW')).toBe(1235);
  });

  it('accepts Decimal-like objects and rejects invalid input', () => {
    expect(toStripeAmount({ toString: () => '99.99' }, 'USD')).toBe(9999);
    expect(() => toStripeAmount(-1, 'USD')).toThrow();
    expect(() => toStripeAmount('abc', 'USD')).toThrow();
  });
});
