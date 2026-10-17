import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { fetchActivity, type Activity } from './api';
import { ACTIVITY_REFRESH_MS } from './activity';

/**
 * «Сейчас на площадке»: перечитывается, пока экран открыт, раз в
 * ACTIVITY_REFRESH_MS (сервер и так кэширует минуту). Null — пока не
 * загрузилось или сервер недоступен: тогда полоску не показываем.
 */
export function useActivity(enabled = true): Activity | null {
  const [activity, setActivity] = useState<Activity | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let cancelled = false;
      const load = () =>
        fetchActivity()
          .then((data) => !cancelled && setActivity(data))
          .catch(() => undefined);
      void load();
      const timer = setInterval(() => void load(), ACTIVITY_REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [enabled]),
  );
  return activity;
}
