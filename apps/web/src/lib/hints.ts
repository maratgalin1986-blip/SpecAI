// Small hints at every step of the site («подсказки», owner, 2026-10-17): one
// or two short sentences next to the form or list they explain. «Понятно»
// hides a hint for good in this browser (localStorage); /kak-polzovatsya can
// bring them all back. Pure helpers over a Storage-like object, so they are
// unit-tested and never throw (private mode, blocked storage).

import { SITE } from './site';

export const HINTS_STORAGE_KEY = 'sp_hints_dismissed';
/** Sent on window when the hints are reset, so the ones on screen come back. */
export const HINTS_RESET_EVENT = 'sp-hints-reset';
/** The help page every hint can point to. */
export const HELP_PAGE = '/kak-polzovatsya';

export interface HintText {
  text: string;
  /** Anchor on the help page with the longer story. */
  more?: string;
}

export const HINTS = {
  'orders-guest': {
    text: 'Опишите, какая техника нужна, где и когда. Телефон не публикуется: исполнители пришлют цены, диспетчер сравнит их и перезвонит вам.',
    more: '#zakazchik',
  },
  'order-customer': {
    text: 'Предложения исполнителей появляются ниже: сравните цену, рейтинг и нажмите «Принять». Телефон исполнителя откроется, когда он подтвердит бронь.',
    more: '#zakazchik',
  },
  'order-provider': {
    text: 'Выберите свободную машину и назовите цену с подачей — другие исполнители её не видят. Заказчик виден только по имени, например «Анна П.», а контакты откроются после подтверждения брони.',
    more: '#ispolnitel',
  },
  dashboard: {
    text: 'Здесь ваши заявки и брони. Карточка «Помощник» подсказывает следующий шаг.',
    more: '#zakazchik',
  },
  'dashboard-customer-mode': {
    text: 'Это ваши заказы техники. Вернуться к своей технике и заявкам — кнопкой «Исполнитель» вверху.',
    more: '#dve-roli',
  },
  provider: {
    text: 'Добавьте технику с фото и ценой — она появится в каталоге и на карте. В приложении выйдите на линию со свободной машиной, и заказчики увидят вас рядом.',
    more: '#ispolnitel',
  },
  'equipment-form': {
    text: 'Название, категория и цена за час или смену — главное. Фото и характеристики помогают заказчику выбрать именно вашу машину.',
    more: '#ispolnitel',
  },
  catalog: {
    text: `Выберите вид техники и откройте машину: там цена и фото. Парк ${SITE.name} показан первым.`,
    more: '#zakazchik',
  },
  register: {
    text: '«Заказать технику» — если ищете машину, «Встать на линию» — если сдаёте свою. Вторую роль можно добавить потом под тем же логином.',
    more: '#dve-roli',
  },
} satisfies Record<string, HintText>;

export type HintId = keyof typeof HINTS;

/** The part of Storage the helpers use (localStorage in the browser). */
export type HintStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or null when the browser does not give access to it. */
export function browserStorage(): HintStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The ids hidden with «Понятно»; an unreadable or broken value counts as none. */
export function dismissedHints(storage: HintStorage | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HINTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isHintDismissed(storage: HintStorage | null, id: string): boolean {
  return dismissedHints(storage).includes(id);
}

/** Hides a hint for good. False when it could not be saved (it hides until reload). */
export function dismissHint(storage: HintStorage | null, id: string): boolean {
  if (!storage) return false;
  try {
    const ids = dismissedHints(storage);
    if (!ids.includes(id)) ids.push(id);
    storage.setItem(HINTS_STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/** «Показать подсказки снова». */
export function resetHints(storage: HintStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(HINTS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
