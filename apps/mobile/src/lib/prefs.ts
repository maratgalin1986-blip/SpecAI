import { useSyncExternalStore } from 'react';
import { parseLineAutoOff, startOfLocalDay, type LineAutoOff } from './line';
import { STORAGE_KEYS, getItem, setItem } from './storage';

/**
 * Локальные настройки исполнителя, которые живут только на этом телефоне
 * (на сервере для них полей нет):
 * - `mode` — «provider» (кабинет исполнителя) или «customer» (исполнитель
 *   заказывает технику как заказчик);
 * - `online` — «На линии / Не на линии». Пока включено, телефон отправляет
 *   своё положение и выбранную машину на карту заказчиков (useLineReporter),
 *   поэтому по умолчанию и при любой ошибке хранилища — выключено: на линию
 *   исполнитель выходит только сам, кнопкой;
 * - `onlineSince` — когда вышел на линию (мс): вечером в 21:00 по времени
 *   телефона линия выключается сама (line.ts lineAutoOffReason);
 * - `autoOff` — линия выключилась сама (почему и когда): «Линия выключилась в
 *   21:00…» в ленте, пока исполнитель не закроет сообщение или снова не выйдет
 *   на линию.
 * Хранятся в SecureStore (есть в Expo Go), при ошибке — в памяти.
 */
export type AppMode = 'provider' | 'customer';

interface PrefsState {
  loaded: boolean;
  mode: AppMode;
  online: boolean;
  onlineSince: number | null;
  autoOff: LineAutoOff | null;
}

export const DEFAULT_PREFS: PrefsState = {
  loaded: false,
  mode: 'provider',
  online: false,
  onlineSince: null,
  autoOff: null,
};

/** Что означает сохранённое значение «на линии»: только явная «1» — онлайн. */
export function parseOnline(stored: string | null | undefined): boolean {
  return stored === '1';
}

/**
 * Начало сохранённой линии: число мс; без него (линия включена в старой
 * версии приложения) — `fallback`: начало сегодняшнего дня, и в приложении,
 * и в фоновой задаче.
 */
export function parseOnlineSince(stored: string | null | undefined, fallback: number): number {
  const value = Number(stored);
  return stored && Number.isFinite(value) && value > 0 ? value : fallback;
}

let state: PrefsState = DEFAULT_PREFS;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit(next: Partial<PrefsState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function ensureLoaded() {
  if (state.loaded || loading) return;
  loading = (async () => {
    const [mode, online, since, autoOff] = await Promise.all([
      getItem(STORAGE_KEYS.appMode),
      getItem(STORAGE_KEYS.providerOnline),
      getItem(STORAGE_KEYS.lineOnlineSince),
      getItem(STORAGE_KEYS.lineAutoOff),
    ]);
    const isOnline = parseOnline(online);
    const onlineSince = isOnline ? parseOnlineSince(since, startOfLocalDay(new Date())) : null;
    // Линия из старой версии без начала: записываем, чтобы начало не менялось.
    if (onlineSince !== null && String(onlineSince) !== since) {
      void persist(STORAGE_KEYS.lineOnlineSince, String(onlineSince));
    }
    emit({
      loaded: true,
      mode: mode === 'customer' ? 'customer' : 'provider',
      online: isOnline,
      onlineSince,
      autoOff: isOnline ? null : parseLineAutoOff(autoOff),
    });
  })().catch(() => emit({ loaded: true, online: false }));
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
  // Новая линия начинается при включении; уже идущая сохраняет своё начало.
  const since = online ? (state.online && state.onlineSince) || Date.now() : null;
  emit({ online, onlineSince: since, ...(online ? { autoOff: null } : {}) });
  void persist(STORAGE_KEYS.providerOnline, online ? '1' : '0');
  void persist(STORAGE_KEYS.lineOnlineSince, since ? String(since) : '');
  if (online) void persist(STORAGE_KEYS.lineAutoOff, '');
}

/** Когда началась текущая линия (мс) — для вечернего выключения; null — не на линии. */
export function lineOnlineSince(): number | null {
  return state.online ? state.onlineSince : null;
}

/** Линия выключилась сама — сообщение в ленте; null — убрать его. */
export function setLineAutoOff(value: LineAutoOff | null) {
  emit({ autoOff: value });
  void persist(STORAGE_KEYS.lineAutoOff, value ? JSON.stringify(value) : '');
}

/** Исполнитель в своём кабинете (а не в «Режиме заказчика»). */
export function isProviderMode(role: string | undefined, mode: AppMode): boolean {
  return role === 'PROVIDER_ADMIN' && mode === 'provider';
}
