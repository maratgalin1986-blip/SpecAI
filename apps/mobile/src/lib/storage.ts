import * as SecureStore from 'expo-secure-store';

export const STORAGE_KEYS = {
  token: 'specai.token',
  user: 'specai.user',
  conversationId: 'specai.conversationId',
  /** Режим исполнителя: «customer» — заказывает технику как заказчик. Только на телефоне. */
  appMode: 'specai.appMode',
  /** «На линии» исполнителя — хранится только на этом телефоне. */
  providerOnline: 'specai.providerOnline',
  /** Машина, с которой исполнитель выходит на линию (id Equipment). */
  lineEquipmentId: 'specai.lineEquipmentId',
  /** Закрытые подсказки (JSON-массив ключей) — только на этом телефоне. */
  hints: 'specai.hints',
  /** Сессия меню администратора (вход по паролю админки), не связана с аккаунтом. */
  adminSession: 'specai.adminSession',
  /** Брони, по которым закрыли «Поддержать ИИСтройка24» (JSON-массив id). */
  supportDismissed: 'specai.supportDismissed',
} as const;

export async function getItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ключа могло не быть — это не ошибка
  }
}
