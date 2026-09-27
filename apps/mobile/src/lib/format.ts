import type { BookingStatus } from './api';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  KZT: '₸',
};

export function formatMoney(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return '—';
  const formatted = amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${currency}`;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Приводит дату к формату YYYY-MM-DD в локальной зоне. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Парсит строку YYYY-MM-DD (или ДД.ММ.ГГГГ) в Date; null, если дата некорректна. */
export function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  let year: number, month: number, day: number;
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждено',
  ACTIVE: 'В работе',
  COMPLETED: 'Завершено',
  CANCELLED: 'Отменено',
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступна',
  RENTED: 'В аренде',
  MAINTENANCE: 'На обслуживании',
  UNAVAILABLE: 'Недоступна',
};

export const SPEC_LABELS: Record<string, string> = {
  capacity: 'Грузоподъёмность',
  horsepower: 'Мощность, л.с.',
  weight: 'Масса',
  bucketCapacity: 'Объём ковша',
  maxDiggingDepth: 'Глубина копания',
  liftHeight: 'Высота подъёма',
  enginePower: 'Мощность двигателя',
  fuelType: 'Топливо',
  operatingWeight: 'Рабочая масса',
};

export function formatSpecValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
