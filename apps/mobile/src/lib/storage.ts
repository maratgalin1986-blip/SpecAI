import * as SecureStore from 'expo-secure-store';

export const STORAGE_KEYS = {
  token: 'specai.token',
  user: 'specai.user',
  conversationId: 'specai.conversationId',
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
