import type { BidStatus, BookingStatus, EquipmentStatus, OrderStatus } from './api';

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

// Индексируется строкой из API, поэтому Record<string>; satisfies гарантирует
// подписи для всех значений серверного enum EquipmentStatus.
export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступна',
  RENTED: 'В аренде',
  IN_MAINTENANCE: 'На обслуживании',
  RETIRED: 'Списана',
} satisfies Record<EquipmentStatus, string>;

export const PAYMENT_STATUS_LABELS: Record<
  'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'REFUND_REQUIRED',
  string
> = {
  PENDING: 'Ожидает оплаты',
  PAID: 'Оплачено',
  FAILED: 'Оплата не прошла',
  REFUNDED: 'Возвращено',
  REFUND_REQUIRED: 'Требуется возврат',
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

/** Дата в полночь локального времени — для сравнения дат без учёта времени. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
