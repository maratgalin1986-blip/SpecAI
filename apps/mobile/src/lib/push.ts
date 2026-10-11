import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { API_URL } from './api';
import { registerPushToken } from './notifications';

// Push-уведомления через Expo (бесплатно): после входа приложение просит
// разрешение, получает Expo push-токен и отдаёт его серверу
// (POST /api/mobile/push-token). При выходе токен удаляется.
//
// В Expo Go на Android удалённых push нет с SDK 53 — там регистрация
// пропускается, а в профиле показывается подсказка. expo-notifications
// подгружается лениво, чтобы в Expo Go не было лишних ошибок при запуске.

export type PushSupport = 'supported' | 'expo-go-android' | 'web';

export function pushSupport(): PushSupport {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return 'expo-go-android';
  return 'supported';
}

export function pushSupportHint(): string | null {
  switch (pushSupport()) {
    case 'expo-go-android':
      return 'В Expo Go на Android push не приходят — включите Telegram или установите приложение из сборки.';
    case 'web':
      return 'Push работает только в мобильном приложении.';
    default:
      return null;
  }
}

/** Путь сайта из уведомления → экран приложения. */
export function appRouteFor(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.split('#')[0] ?? '';
  const order = /^\/orders\/([\w-]{1,64})$/.exec(clean);
  if (order) return `/orders/${order[1]}`;
  if (clean.startsWith('/provider')) return '/provider';
  if (clean.startsWith('/dashboard')) return '/bookings';
  return null;
}

type NotificationsModule = typeof import('expo-notifications');

let handlerSet = false;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (pushSupport() !== 'supported') return null;
  try {
    const Notifications = await import('expo-notifications');
    if (!handlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    return Notifications;
  } catch {
    return null;
  }
}

async function obtainPushToken(Notifications: NotificationsModule): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Заявки и брони',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

async function forgetPushToken(pushToken: string, bearer: string) {
  try {
    await fetch(`${API_URL}/api/mobile/push-token`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ token: pushToken }),
    });
  } catch {
    // Offline: the server drops the token once Expo reports the device gone.
  }
}

/**
 * Вызывается в корневом layout: регистрирует устройство после входа,
 * удаляет токен при выходе и открывает экран по нажатию на уведомление.
 * Любая ошибка (нет разрешения, Expo Go, сеть) только пишется в лог.
 */
export function usePushRegistration(authToken: string | null) {
  const registered = useRef<{ pushToken: string; bearer: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!authToken) {
      const previous = registered.current;
      registered.current = null;
      if (previous) void forgetPushToken(previous.pushToken, previous.bearer);
      return;
    }
    (async () => {
      try {
        const Notifications = await loadNotifications();
        if (!Notifications || cancelled) return;
        const pushToken = await obtainPushToken(Notifications);
        if (!pushToken || cancelled) return;
        await registerPushToken(pushToken, Platform.OS);
        registered.current = { pushToken, bearer: authToken };
      } catch (error) {
        console.warn('[push] registration skipped', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    void loadNotifications().then((Notifications) => {
      if (!Notifications || cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { path?: string } | undefined;
        const route = appRouteFor(data?.path);
        if (route) router.push(route as never);
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);
}
