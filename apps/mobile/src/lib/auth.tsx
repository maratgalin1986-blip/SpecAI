import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchMe, login as apiLogin, type ApiUser } from './api';
import { STORAGE_KEYS, getItem, removeItem, setItem } from './storage';

interface AuthContextValue {
  /** null — не авторизован; undefined — ещё читаем SecureStore. */
  token: string | null;
  user: ApiUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Перечитать пользователя с сервера (например, статус подтверждения e-mail). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    setToken(null);
    setUser(null);
    await Promise.all([
      removeItem(STORAGE_KEYS.token),
      removeItem(STORAGE_KEYS.user),
      removeItem(STORAGE_KEYS.conversationId),
    ]);
  }, []);

  // Восстанавливаем сессию при запуске и проверяем токен на сервере.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedToken, storedUser] = await Promise.all([
        getItem(STORAGE_KEYS.token),
        getItem(STORAGE_KEYS.user),
      ]);
      if (cancelled) return;
      if (!storedToken) {
        setLoading(false);
        return;
      }
      setToken(storedToken);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser) as ApiUser);
        } catch {
          // повреждённый кэш — перечитаем с сервера
        }
      }
      setLoading(false);

      try {
        const { user: fresh } = await fetchMe();
        if (cancelled) return;
        setUser(fresh);
        await setItem(STORAGE_KEYS.user, JSON.stringify(fresh));
      } catch (error) {
        // 401 — токен истёк или пароль сменён: выходим. Сетевые ошибки игнорируем.
        if (!cancelled && error instanceof ApiError && error.status === 401) {
          await clear();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const refreshUser = useCallback(async () => {
    try {
      const { user: fresh } = await fetchMe();
      setUser(fresh);
      await setItem(STORAGE_KEYS.user, JSON.stringify(fresh));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clear();
      }
      // Сетевые ошибки игнорируем — остаёмся с кэшированным пользователем.
    }
  }, [clear]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email.trim(), password);
      await setItem(STORAGE_KEYS.token, result.token);
      await setItem(STORAGE_KEYS.user, JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      // Ответ логина не содержит emailVerified — дотягиваем полный профиль в фоне.
      void refreshUser();
    },
    [refreshUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, isLoading, login, logout: clear, refreshUser }),
    [token, user, isLoading, login, clear, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
