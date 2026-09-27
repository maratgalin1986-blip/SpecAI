// Currencies that Stripe treats as having no minor unit (amounts are whole units).
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}

/**
 * Convert a price (Prisma Decimal, number, or numeric string) into the integer
 * amount in the currency's smallest unit that Stripe expects
 * (e.g. 12.34 USD -> 1234, 500 JPY -> 500).
 */
export function toStripeAmount(
  amount: { toString(): string } | number | string,
  currency: string,
): number {
  const value = typeof amount === 'number' ? amount : Number(amount.toString());
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid amount: ${String(amount)}`);
  }

  const factor = isZeroDecimalCurrency(currency) ? 1 : 100;
  return Math.round(value * factor);
}
