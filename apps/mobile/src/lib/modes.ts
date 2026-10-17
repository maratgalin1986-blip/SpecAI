import type { HintId } from './hints';
import type { AppMode } from './prefs';

/**
 * Один вход — два режима (владелец, 2026-10-17). Кто какой переключатель видит:
 * - исполнитель (админ компании) — «Заказчик ⇄ Исполнитель» в профиле, на
 *   главной и в ленте;
 * - заказчик — «Стать исполнителем» в профиле (форма с компанией и адресом);
 * - машинист и администратор площадки — ничего: машинист работает только в
 *   сменах своей компании, роль площадки к заказам не относится.
 */
export type ModeSwitchKind = 'switch' | 'become' | 'none';

export function modeSwitchKind(role: string | null | undefined): ModeSwitchKind {
  if (role === 'PROVIDER_ADMIN') return 'switch';
  if (role === 'CUSTOMER') return 'become';
  return 'none';
}

/** Переключатель режима на главной и в ленте — только у исполнителя. */
export function showsModePill(role: string | null | undefined): boolean {
  return modeSwitchKind(role) === 'switch';
}

/** Подсказка в профиле: как переключаться или как стать исполнителем. */
export function profileHint(role: string | null | undefined): HintId | null {
  const kind = modeSwitchKind(role);
  return kind === 'switch' ? 'profile.switch' : kind === 'become' ? 'profile.become' : null;
}

/** Первый экран режима: заказчик — карта с заказом, исполнитель — лента заявок. */
export function modeHome(mode: AppMode): '/(tabs)' | '/(tabs)/feed' {
  return mode === 'provider' ? '/(tabs)/feed' : '/(tabs)';
}

export const MODE_OPTIONS = [
  { value: 'customer', label: 'Заказчик' },
  { value: 'provider', label: 'Исполнитель' },
] as const satisfies readonly { value: AppMode; label: string }[];

export interface BecomeProviderForm {
  companyName: string;
  baseAddress: string;
  phone: string;
}

export interface BecomeProviderInput {
  companyName: string;
  baseAddress: string;
  phone?: string;
}

export type BecomeProviderCheck =
  | { ok: true; value: BecomeProviderInput }
  | { ok: false; field: keyof BecomeProviderForm; error: string };

/**
 * Проверка формы «Стать исполнителем» до отправки — те же границы, что у
 * сервера (POST /api/account/provider): название 1–200 символов, адрес от
 * 3 символов (по нему сервер ставит точку на карте), телефон необязателен.
 */
export function checkBecomeProvider(form: BecomeProviderForm): BecomeProviderCheck {
  const companyName = form.companyName.replace(/\s+/g, ' ').trim();
  const baseAddress = form.baseAddress.replace(/\s+/g, ' ').trim();
  const phone = form.phone.trim();
  if (!companyName) {
    return { ok: false, field: 'companyName', error: 'Укажите название компании или ваше имя' };
  }
  if (companyName.length > 200) {
    return { ok: false, field: 'companyName', error: 'Слишком длинное название — до 200 знаков' };
  }
  if (baseAddress.length < 3) {
    return {
      ok: false,
      field: 'baseAddress',
      error: 'Укажите, где стоит техника: город, улица, дом — по адресу вас найдут на карте',
    };
  }
  if (baseAddress.length > 200) {
    return { ok: false, field: 'baseAddress', error: 'Слишком длинный адрес — до 200 знаков' };
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (phone.length > 30 || digits < 10 || digits > 15) {
      return { ok: false, field: 'phone', error: 'Проверьте телефон: например, +7 900 000-00-00' };
    }
  }
  return { ok: true, value: { companyName, baseAddress, ...(phone ? { phone } : {}) } };
}
