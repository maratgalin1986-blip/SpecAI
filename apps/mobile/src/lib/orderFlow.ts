/**
 * Чистая логика экранов «как в такси» без React Native: значки типов техники,
 * этапы заказа, быстрый заказ, доход и расстояние. Покрыта тестами
 * (orderFlow.test.ts).
 */

/** Значок типа техники по названию категории (категории приходят с сервера). */
const CATEGORY_ICONS: [RegExp, string][] = [
  [/автовышк|вышк|подъ[её]мник/i, '🪜'],
  [/кран|манипулятор/i, '🏗️'],
  [/самосв[ао]л|грузов|тягач|трал|шаланд|эвакуатор/i, '🚛'],
  [/бетон|миксер|раствор/i, '🧱'],
  [/ямобур|бур/i, '🕳️'],
  [/каток|асфальт/i, '🛣️'],
  [/экскаватор|погрузчик|бульдозер|грейдер|трактор|jcb/i, '🚜'],
  [/генератор|компрессор|электро/i, '⚡'],
  [/вакуум|илосос|ассениз|водовоз|цистерн/i, '💧'],
];

export function categoryIcon(name: string | null | undefined): string {
  if (!name) return '🛠️';
  const match = CATEGORY_ICONS.find(([pattern]) => pattern.test(name));
  return match ? match[1] : '🛠️';
}

export type OrderStageKey = 'created' | 'offers' | 'chosen' | 'onSite' | 'done';

export const ORDER_STAGES: { key: OrderStageKey; label: string }[] = [
  { key: 'created', label: 'Создан' },
  { key: 'offers', label: 'Предложения' },
  { key: 'chosen', label: 'Исполнитель выбран' },
  { key: 'onSite', label: 'В пути / на объекте' },
  { key: 'done', label: 'Завершён' },
];

export interface StageInput {
  orderStatus: string;
  bidCount: number;
  /** Статус брони, созданной по заявке (если она есть). */
  bookingStatus?: string | null;
}

/**
 * Текущий этап заявки для таймлайна: индекс в ORDER_STAGES и флаг отмены.
 * Заявка OPEN без предложений — «Создан», с предложениями — «Предложения»;
 * MATCHED — «Исполнитель выбран», бронь ACTIVE — «на объекте», COMPLETED — «Завершён».
 */
export function orderStage(input: StageInput): { index: number; cancelled: boolean } {
  const { orderStatus, bidCount, bookingStatus } = input;
  if (orderStatus === 'CANCELLED' || bookingStatus === 'CANCELLED') {
    return { index: bidCount > 0 ? 1 : 0, cancelled: true };
  }
  if (bookingStatus === 'COMPLETED') return { index: 4, cancelled: false };
  if (bookingStatus === 'ACTIVE') return { index: 3, cancelled: false };
  if (orderStatus === 'MATCHED' || bookingStatus) return { index: 2, cancelled: false };
  return { index: bidCount > 0 ? 1 : 0, cancelled: false };
}

/** Заголовок экрана заказа, как статус поездки. */
export function stageHeadline(input: StageInput): string {
  const { index, cancelled } = orderStage(input);
  if (cancelled) return 'Заказ отменён';
  if (index === 0) return 'Ищем исполнителей';
  if (index === 1) return 'Есть предложения — выберите';
  if (index === 2) {
    return input.bookingStatus === 'CONFIRMED'
      ? 'Исполнитель подтвердил заказ'
      : 'Ждём подтверждения исполнителя';
  }
  if (index === 3) return 'Техника работает на объекте';
  return 'Заказ выполнен';
}

/** Строка «Адрес: …» в описании старых заявок (новые хранят адрес в location). */
const ADDRESS_LINE = /(?:^|\n)\s*(?:Адрес|Место|Где)\s*:\s*(.+)/i;

export function addressFromDescription(description: string): string | null {
  const match = ADDRESS_LINE.exec(description);
  return match?.[1]?.trim() || null;
}

export interface QuickOrderInput {
  categoryName?: string | null;
  address?: string;
  note?: string;
  /** true — «Нужна сейчас» (сегодня). */
  urgent: boolean;
  days: number;
}

/** Описание заявки из полей быстрого заказа (сервер требует непустое описание). */
export function quickOrderDescription(input: QuickOrderInput): string {
  const what = input.categoryName
    ? `Нужна техника: ${input.categoryName.toLowerCase()}`
    : 'Нужна спецтехника';
  const head = input.urgent ? `${what} — сегодня, как можно скорее` : what;
  const length = input.days === 1 ? 'на 1 смену' : `на ${input.days} дн`;
  const lines = [`${head}, ${length}.`];
  const note = input.note?.trim();
  if (note) lines.push(note);
  return lines.join('\n');
}

/** Сколько дней в заявке, обе даты включительно. */
export function orderDays(start: string | Date, end: string | Date): number {
  const from = new Date(start);
  const to = new Date(end);
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** «Сегодня», «Завтра» или дата ДД.ММ. */
export function relativeDay(value: string | Date, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

const EARNING_STATUSES = new Set(['CONFIRMED', 'ACTIVE', 'COMPLETED']);

/**
 * Доход исполнителя за месяц по броням: подтверждённые, в работе и завершённые
 * с началом в этом месяце. Это стоимость брони, а не поступившие деньги.
 */
export function monthIncome(
  bookings: { status: string; startDate: string; totalPrice: string | number }[],
  now: Date = new Date(),
): number {
  return bookings.reduce((sum, booking) => {
    if (!EARNING_STATUSES.has(booking.status)) return sum;
    const start = new Date(booking.startDate);
    if (start.getFullYear() !== now.getFullYear() || start.getMonth() !== now.getMonth()) {
      return sum;
    }
    const price = Number(booking.totalPrice);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);
}

/** Расстояние по прямой, км (формула гаверсинусов). */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} м`;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} км`;
}

/** Цена «по прайсу» для заявки: смена × дни. */
export function priceByRate(dailyRate: string | number, days: number): number {
  const rate = Number(dailyRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(rate * Math.max(1, days));
}
