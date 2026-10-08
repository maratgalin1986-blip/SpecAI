import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchUnreadMessages } from './api';

/** Как часто бейдж вкладки спрашивает сервер о новых сообщениях. */
const POLL_MS = 30_000;

/**
 * Непрочитанные сообщения в чатах по заявкам — бейдж на вкладках «Заказы» /
 * «Мои заказы». Обновляется раз в 30 секунд и при возврате в приложение;
 * без токена (или при ошибке сети) бейджа нет.
 */
export function useUnreadMessages(token: string | null | undefined): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { unread: count } = await fetchUnreadMessages();
        if (!cancelled) setUnread(count);
      } catch {
        // Сеть или старый сервер без чата: бейдж просто не показываем.
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [token]);

  return unread;
}
