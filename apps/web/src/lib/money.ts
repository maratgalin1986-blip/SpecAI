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

/**
 * Headline price of a listing: per machine-hour when an hourly rate is set
 * ("от 3 000 ₽/ч"), otherwise per day/shift.
 */
export function formatRate(item: {
  hourlyRate?: number | string | { toString(): string } | null;
  dailyRate: number | string | { toString(): string };
  currency?: string;
}) {
  if (item.hourlyRate !== null && item.hourlyRate !== undefined) {
    return {
      price: `от ${formatMoney(item.hourlyRate, item.currency)}`,
      unit: '/ч',
      note: `смена 8 ч — ${formatMoney(item.dailyRate, item.currency)}`,
    };
  }
  return { price: formatMoney(item.dailyRate, item.currency), unit: '/сутки', note: null };
}
