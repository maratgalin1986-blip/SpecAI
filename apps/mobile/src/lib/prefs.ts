import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, getItem, setItem } from './storage';

/**
 * Локальные настройки исполнителя, которые живут только на этом телефоне
 * (на сервере для них полей нет):
 * - `mode` — «provider» (кабинет исполнителя) или «customer» (исполнитель
 *   заказывает технику как заказчик);
 * - `online` — «На линии / Не на линии». Пока это подсказка для самого
 *   исполнителя: лента обновляется сама, а заказчики статус не видят.
 * Хранятся в SecureStore (есть в Expo Go), при ошибке — в памяти.
 */
export type AppMode = 'provider' | 'customer';

interface PrefsState {
  loaded: boolean;
  mode: AppMode;
  online: boolean;
}

// По умолчанию исполнитель «на линии», чтобы лента не была пустой при первом входе.
let state: PrefsState = { loaded: false, mode: 'provider', online: true };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit(next: Partial<PrefsState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function ensureLoaded() {
  if (state.loaded || loading) return;
  loading = (async () => {
    const [mode, online] = await Promise.all([
      getItem(STORAGE_KEYS.appMode),
      getItem(STORAGE_KEYS.providerOnline),
    ]);
    emit({
      loaded: true,
      mode: mode === 'customer' ? 'customer' : 'provider',
      online: online !== '0',
    });
  })().catch(() => emit({ loaded: true }));
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

export function usePrefs(): PrefsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

async function persist(key: string, value: string) {
  try {
    await setItem(key, value);
  } catch {
    // Хранилище недоступно — значение остаётся в памяти до перезапуска.
  }
}

export function setAppMode(mode: AppMode) {
  emit({ mode });
  void persist(STORAGE_KEYS.appMode, mode);
}

export function setProviderOnline(online: boolean) {
  emit({ online });
  void persist(STORAGE_KEYS.providerOnline, online ? '1' : '0');
}

/** Исполнитель в своём кабинете (а не в «Режиме заказчика»). */
export function isProviderMode(role: string | undefined, mode: AppMode): boolean {
  return role === 'PROVIDER_ADMIN' && mode === 'provider';
}
