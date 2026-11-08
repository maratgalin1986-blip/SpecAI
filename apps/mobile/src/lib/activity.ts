import type { Activity } from './api';
import { pluralizeRu } from './format';

/**
 * «Сейчас на площадке» в приложении (GET /api/activity): только настоящие
 * числа за московский день. Ноль не показываем как «0 заявок» и ничего не
 * округляем вверх: при нуле — спокойная строка.
 */

export const ACTIVITY_REFRESH_MS = 60_000;

/** Ноль заявок за день — так и говорим. */
export const QUIET_DAY = 'Сегодня новых заявок пока нет';

/**
 * Полоска на главной заказчика: «Сегодня: 14 заявок · 3 машины на линии
 * рядом». `nearOnline` — машины на линии вокруг заказчика с его карты (null,
 * если геопозиции нет: тогда — по всей площадке, без «рядом»).
 */
export function customerStripText(today: Activity['today'], nearOnline: number | null): string {
  const parts: string[] = [];
  if (today.orders > 0) parts.push(pluralizeRu(today.orders, ['заявка', 'заявки', 'заявок']));
  const online = nearOnline ?? today.online;
  if (online > 0) {
    parts.push(
      `${pluralizeRu(online, ['машина', 'машины', 'машин'])} на линии${nearOnline !== null ? ' рядом' : ''}`,
    );
  }
  return parts.length > 0 ? `Сегодня: ${parts.join(' · ')}` : QUIET_DAY;
}

/** Строка над лентой исполнителя: «Сегодня 14 новых заявок». */
export function feedTodayText(today: Activity['today']): string {
  return today.orders > 0
    ? `Сегодня ${pluralizeRu(today.orders, ['новая заявка', 'новые заявки', 'новых заявок'])}`
    : QUIET_DAY;
}

/** Подпись под списком событий: лента собирается автоматически. */
export const ACTIVITY_NOTE =
  'Лента обновляется автоматически: настоящие заявки, машины и брони площадки, без имён и телефонов.';
