/**
 * Чистая логика ленты исполнителя «как в Яндекс Про»: обратный отсчёт
 * приёма предложений, оценка подачи по расстоянию, разбивка цены
 * предложения, тексты спроса. Покрыта тестами (providerFeed.test.ts).
 */

/** Открыто ли ещё окно приёма предложений (без срока — всегда открыто). */
export function isBidWindowOpen(
  order: { bidsUntil?: string | null },
  now: Date = new Date(),
): boolean {
  if (!order.bidsUntil) return true;
  const until = new Date(order.bidsUntil);
  return Number.isNaN(until.getTime()) || until.getTime() > now.getTime();
}

/** «осталось 1 ч 20 мин», «осталось 45 мин» или null, когда срок вышел. */
export function bidsLeftText(
  bidsUntil: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!bidsUntil) return null;
  const left = new Date(bidsUntil).getTime() - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return null;
  const minutes = Math.ceil(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `осталось ${Math.floor(hours / 24)} дн ${hours % 24} ч`;
  if (hours > 0) return `осталось ${hours} ч${rest > 0 ? ` ${rest} мин` : ''}`;
  return `осталось ${minutes} мин`;
}

/** Через сколько миллисекунд обновить отсчёт: раз в минуту, в последние 10 минут — каждые 15 с. */
export function countdownTickMs(bidsUntil: string | null | undefined, now: Date = new Date()) {
  if (!bidsUntil) return null;
  const left = new Date(bidsUntil).getTime() - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return null;
  return left <= 10 * 60_000 ? 15_000 : 60_000;
}

/**
 * Оценка подачи: расстояние от базы до объекта × цена за км компании.
 * null, если цена не задана или расстояние неизвестно.
 */
export function deliveryEstimate(
  km: number | null | undefined,
  pricePerKm: string | number | null | undefined,
): number | null {
  if (km == null || pricePerKm == null || pricePerKm === '') return null;
  const rate = Number(pricePerKm);
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(km)) return null;
  return Math.round(km * rate);
}

/** Итог предложения: подача + смена × смен (копейки округляются). */
export function bidTotal(delivery: number, shiftPrice: number, shifts: number): number {
  return Math.round((delivery + shiftPrice * Math.max(1, shifts)) * 100) / 100;
}

/** Число из поля ввода («12 000,50» → 12000.5), NaN для пустого или мусора. */
export function parseAmount(value: string): number {
  const n = Number(value.replace(',', '.').replace(/\s/g, ''));
  return value.trim() === '' ? NaN : n;
}

/** Разбивка цены предложения для карточки: null, если исполнитель её не дал. */
export function offerParts(bid: {
  price: string | number;
  deliveryPrice?: string | number | null;
  shiftPrice?: string | number | null;
  shifts?: number | null;
}): { delivery: number; shiftPrice: number; shifts: number; total: number } | null {
  const shiftPrice = Number(bid.shiftPrice ?? NaN);
  const shifts = Number(bid.shifts ?? NaN);
  if (!(shiftPrice > 0) || !(shifts > 0)) return null;
  const delivery = Number(bid.deliveryPrice ?? 0);
  return {
    delivery: Number.isFinite(delivery) && delivery > 0 ? delivery : 0,
    shiftPrice,
    shifts: Math.round(shifts),
    total: Number(bid.price),
  };
}

/** Подсказка заказчику по выбранному виду техники (как на сайте). */
export function customerDemandText(
  level: 'low' | 'medium' | 'high' | null,
  categoryName?: string | null,
): string {
  const what = categoryName ? categoryName.toLowerCase() : 'техники';
  if (level === 'high') return `Свободных машин мало (${what}) — укажите дату заранее`;
  if (level === 'medium') return `Спрос на ${what} средний — лучше указать дату заранее`;
  return `Сейчас много свободных машин: ${what}`;
}
