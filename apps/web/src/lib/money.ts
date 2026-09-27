/** Formats a price for display, e.g. 25000 RUB → "25 000 ₽". */
export function formatMoney(amount: number | string | { toString(): string }, currency = 'RUB') {
  const value = typeof amount === 'number' ? amount : Number(amount.toString());
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString('ru-RU')} ${currency}`;
  }
}
