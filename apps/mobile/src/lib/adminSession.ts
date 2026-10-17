import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, getItem, removeItem, setItem } from './storage';

/**
 * Сессия меню администратора. Вход — по паролю админки площадки
 * (POST /api/admin/login), не по аккаунту: владелец может быть в приложении
 * и заказчиком, и исполнителем, а меню администратора открывается отдельно.
 * Значение хранится в SecureStore; если хранилище недоступно — только в
 * памяти до перезапуска приложения.
 */
export interface AdminSessionState {
  loaded: boolean;
  session: string | null;
  /** Почему пришлось войти снова (сессия истекла) — показывается над паролем. */
  notice: string | null;
}

const INITIAL: AdminSessionState = { loaded: false, session: null, notice: null };

let state: AdminSessionState = INITIAL;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
/** Растёт при каждом входе/выходе: чтение из хранилища не перетирает свежее решение. */
let generation = 0;

function emit(next: Partial<AdminSessionState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

/** Читает сессию из хранилища один раз; ошибки хранилища — «не вошёл». */
export function loadAdminSession(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  if (loading) return loading;
  const startedAt = generation;
  loading = getItem(STORAGE_KEYS.adminSession)
    .catch(() => null)
    .then((stored) => {
      if (generation !== startedAt) {
        emit({ loaded: true });
        return;
      }
      emit({ loaded: true, session: stored || null });
    });
  return loading;
}

export async function getAdminSession(): Promise<string | null> {
  await loadAdminSession();
  return state.session;
}

export async function saveAdminSession(session: string): Promise<void> {
  generation += 1;
  emit({ loaded: true, session, notice: null });
  try {
    await setItem(STORAGE_KEYS.adminSession, session);
  } catch {
    // Хранилище недоступно — вход действует до перезапуска приложения.
  }
}

/** Выход из меню администратора; notice — причина, если выход не по кнопке. */
export async function clearAdminSession(notice: string | null = null): Promise<void> {
  generation += 1;
  emit({ loaded: true, session: null, notice });
  await removeItem(STORAGE_KEYS.adminSession);
}

function subscribe(listener: () => void) {
  void loadAdminSession();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

export function useAdminSession(): AdminSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Только для тестов: вернуть хранилище сессии в начальное состояние. */
export function resetAdminSessionForTests() {
  state = INITIAL;
  loading = null;
  generation = 0;
  listeners.clear();
}
