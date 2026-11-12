import type { Order } from './api';
import { addressFromDescription, distanceKm, formatDistance } from './orderFlow';

/**
 * Где работа — так, как её вправе видеть читающий заявку. Заказчик и
 * исполнитель с подтверждённой бронью получают адрес и точку. Остальным
 * исполнителям сервер (apps/web/src/lib/orderLocationPrivacy.ts) отдаёт
 * location = { city, addressLine: null, latitude: null, longitude: null,
 * distanceKm }: только город и целые километры от базы. Здесь это
 * превращается в строки для ленты и экрана заявки — без «null» в тексте и
 * без точки, которой нет.
 */
export interface OrderPlace {
  /** Адрес (точный) или город (до брони); null — показать нечего. */
  text: string | null;
  /** Адрес скрыт до подтверждения брони. */
  rough: boolean;
  /** Расстояние от базы исполнителя, км: по точке или присланное сервером. */
  km: number | null;
  /** «1,2 км» по точке, «≈ 12 км» по ответу сервера. */
  distanceText: string | null;
  /** «≈ 12 км от вашей базы» — только когда адрес скрыт. */
  fromBaseText: string | null;
  /** EXACT_ADDRESS_LATER, когда адрес скрыт; иначе null. */
  hint: string | null;
  /** Точка работ для карты и маршрута; null — рисовать и вести некуда. */
  point: { lat: number; lon: number } | null;
}

export const EXACT_ADDRESS_LATER = 'Точный адрес — после подтверждения брони';

function clean(value: string | null | undefined): string | null {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > 0 ? text : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Сервер скрыл адрес: ни строки адреса, ни точки, зато есть поле distanceKm. */
export function isRoughLocation(location: Order['location']): boolean {
  if (!location || !('distanceKm' in location)) return false;
  return !clean(location.addressLine) && !finite(location.latitude) && !finite(location.longitude);
}

/** «≈ 12 км от вашей базы»; ближе километра — «меньше 1 км от вашей базы». */
export function fromBaseText(km: number): string {
  const whole = Math.max(0, Math.round(km));
  return whole < 1 ? 'меньше 1 км от вашей базы' : `≈ ${whole} км от вашей базы`;
}

export function orderPlace(
  order: Pick<Order, 'location' | 'description'>,
  base: { lat: number; lon: number } | null | undefined,
): OrderPlace {
  const location = order.location ?? null;
  if (isRoughLocation(location)) {
    const km =
      finite(location?.distanceKm) && location.distanceKm >= 0 ? location.distanceKm : null;
    return {
      // Адрес из описания не подставляем: до брони исполнителю — только город.
      text: clean(location?.city),
      rough: true,
      km,
      distanceText: km === null ? null : km < 1 ? '< 1 км' : `≈ ${Math.round(km)} км`,
      fromBaseText: km === null ? null : fromBaseText(km),
      hint: EXACT_ADDRESS_LATER,
      point: null,
    };
  }
  const point =
    finite(location?.latitude) && finite(location?.longitude)
      ? { lat: location.latitude, lon: location.longitude }
      : null;
  const km = base && point ? distanceKm(base, point) : null;
  return {
    text:
      clean(location?.addressLine) ??
      clean(addressFromDescription(order.description ?? '')) ??
      clean(location?.city),
    rough: false,
    km,
    distanceText: km === null ? null : formatDistance(km),
    fromBaseText: null,
    hint: null,
    point,
  };
}
