import { useEffect, useState } from 'react';
import { STORAGE_KEYS, getItem, setItem } from './storage';

/**
 * «Приветствие перед входом» (владелец, 2026-10-17): при первом запуске —
 * два пути, «Мне нужна техника» (заказчик) и «У меня есть техника»
 * (исполнитель); выбор открывает регистрацию с нужной ролью. Показывается,
 * пока человек не выберет путь (запоминается на телефоне); снова — со
 * входа, «Как это работает». Те же тексты на сайте (apps/web/src/lib/welcome.ts).
 */

export type AccountType = 'CUSTOMER' | 'PROVIDER';

export interface WelcomePath {
  accountType: AccountType;
  /** Параметр `role` экрана регистрации. */
  role: 'customer' | 'provider';
  title: string;
  text: string;
}

export const WELCOME_PATHS: readonly WelcomePath[] = [
  {
    accountType: 'CUSTOMER',
    role: 'customer',
    title: 'Мне нужна техника',
    text: 'Разместите заявку: что, где и на какую дату. Исполнители рядом сами пришлют цены — выберете лучшую. Бесплатно.',
  },
  {
    accountType: 'PROVIDER',
    role: 'provider',
    title: 'У меня есть техника',
    text: 'Зарегистрируйтесь один раз, выйдите на линию с машиной — заявки рядом приходят сами. Бесплатно, без комиссии.',
  },
];

/**
 * Роль из параметра экрана регистрации (`?role=provider`) → тип аккаунта;
 * null — параметра нет или он непонятен (форма начинается с заказчика).
 */
export function accountTypeFromRole(
  role: string | string[] | null | undefined,
): AccountType | null {
  const raw = (Array.isArray(role) ? role[0] : role)?.trim().toLowerCase();
  if (raw === 'provider') return 'PROVIDER';
  if (raw === 'customer') return 'CUSTOMER';
  return null;
}

/** Сохранённое «приветствие пройдено»: только явная «1». */
export function parseWelcomeSeen(stored: string | null | undefined): boolean {
  return stored === '1';
}

let seen: boolean | null = null;

/** Человек выбрал путь (или «Войти») — при следующем запуске сразу вход. */
export function markWelcomeSeen(): void {
  seen = true;
  void setItem(STORAGE_KEYS.welcomeSeen, '1').catch(() => undefined);
}

/** null — ещё читаем хранилище; при ошибке хранилища приветствие показываем. */
export function useWelcomeSeen(): boolean | null {
  const [value, setValue] = useState<boolean | null>(seen);
  useEffect(() => {
    if (seen !== null) return;
    let cancelled = false;
    void getItem(STORAGE_KEYS.welcomeSeen).then((stored) => {
      seen = seen ?? parseWelcomeSeen(stored);
      if (!cancelled) setValue(seen);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}
