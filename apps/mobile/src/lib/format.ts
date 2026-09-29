import type { BidStatus, BookingStatus, EquipmentStatus, OrderStatus } from './api';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  KZT: '₸',
};

/** Разбивает число на разряды пробелом (fallback без Intl): 12500 → «12 500». */
function groupDigits(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** Цена как на сайте: 12500 RUB → «12 500 ₽» (ru-RU, без копеек). Валюта по умолчанию — RUB. */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string = 'RUB',
): string {
  if (value === null || value === undefined) return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return '—';
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    const symbol = CURRENCY_SYMBOLS[code] ?? code;
    return `${groupDigits(amount)}\u00a0${symbol}`;
  }
}

/** Единица главной цены: «₽/час» или «₽/сутки». */
export function currencySymbol(currency: string = 'RUB'): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

export interface RateLike {
  hourlyRate?: string | number | null;
  dailyRate: string | number;
  currency?: string;
}

/**
 * Главная цена позиции, как на сайте (`apps/web/src/lib/money.ts` → formatRate):
 * с машино-часом — «от 3 000 ₽/час», смена 8 ч — dailyRate; иначе dailyRate за сутки.
 */
export function formatRate(item: RateLike): { price: string; unit: string; note: string | null } {
  const hasHourly =
    item.hourlyRate !== null && item.hourlyRate !== undefined && Number(item.hourlyRate) > 0;
  if (hasHourly) {
    return {
      price: `от ${formatMoney(item.hourlyRate, item.currency)}`,
      unit: '/час',
      note: `смена 8 ч — ${formatMoney(item.dailyRate, item.currency)}`,
    };
  }
  return { price: formatMoney(item.dailyRate, item.currency), unit: '/сутки', note: null };
}

/** Телефон в цифры для tel:-ссылки: «+7 (927) 242-80-88» → «+79272428088». */
export function phoneToHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `tel:${digits}`;
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

// Индексируется строкой из API, поэтому Record<string>; satisfies гарантирует
// подписи для всех значений серверного enum EquipmentStatus.
export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступна',
  RENTED: 'В аренде',
  IN_MAINTENANCE: 'На обслуживании',
  RETIRED: 'Списана',
} satisfies Record<EquipmentStatus, string>;

export const PAYMENT_STATUS_LABELS: Record<'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED', string> = {
  PENDING: 'Ожидает оплаты',
  PAID: 'Оплачено',
  FAILED: 'Оплата не прошла',
  REFUNDED: 'Возвращено',
};

export const REFUND_REQUIRED_LABEL = 'Требуется возврат';

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

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: 'Открыта',
  MATCHED: 'Техника выбрана',
  CANCELLED: 'Отменена',
};

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  PENDING: 'Ожидает',
  ACCEPTED: 'Принято',
  REJECTED: 'Отклонено',
};

/** Русское склонение: pluralizeRu(3, ['день', 'дня', 'дней']) → «3 дня». */
export function pluralizeRu(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  let form = forms[2];
  if (abs < 10 || abs > 20) {
    if (last === 1) form = forms[0];
    else if (last >= 2 && last <= 4) form = forms[1];
  }
  return `${count} ${form}`;
}

/** Число дней аренды между датами (как считает сервер); null, если конец не позже начала. */
export function rentalDays(start: Date, end: Date): number | null {
  if (end <= start) return null;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

/**
 * Число дней брони, обе даты включительно (как считает сервер): 1–1 марта — 1 день,
 * 1–3 марта — 3 дня. null, если конец раньше начала.
 */
export function bookingDays(start: Date, end: Date): number | null {
  const from = startOfDay(start);
  const to = startOfDay(end);
  if (to < from) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/**
 * Цена смены (8 ч) для введённой часовой ставки: «2500» → «20000». Пустой или
 * неверный ввод даёт «». Подставляется при каждом вводе, пока смену не меняли вручную.
 */
export function suggestShiftRate(hourly: string): string {
  const value = Number(hourly.replace(',', '.'));
  if (!hourly.trim() || !Number.isFinite(value) || value <= 0) return '';
  return String(Math.round(value * 8 * 100) / 100);
}

/** Дата в полночь локального времени — для сравнения дат без учёта времени. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
