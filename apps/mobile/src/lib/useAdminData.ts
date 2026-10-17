import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Загрузка данных экрана меню администратора: при каждом открытии экрана
 * и по «потянуть вниз». 401 обрабатывает adminFetch (экран сменится на поле
 * пароля), здесь остаются только понятные тексты ошибок.
 */
export function useAdminData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const requestId = useRef(0);

  const run = useCallback(async (mode: 'focus' | 'refresh') => {
    const id = ++requestId.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const next = await loadRef.current();
      if (id !== requestId.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить данные');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run('focus');
    }, [run]),
  );

  const refresh = useCallback(() => run('refresh'), [run]);
  return { data, setData, error, loading, refreshing, refresh };
}
