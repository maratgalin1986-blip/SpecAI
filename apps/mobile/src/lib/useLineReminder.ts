import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  cancelLineReminder,
  LINE_REMINDER_KIND,
  lineReminderEligible,
  loadLineReminder,
  saveLineReminder,
  syncLineReminder,
  type LineReminderSettings,
  type ReminderSyncResult,
} from './lineReminder';
import { setAppMode } from './prefs';
import { loadNotifications } from './push';

/** Сохранить настройку из профиля и сразу переставить напоминание. */
export async function applyLineReminder(
  settings: LineReminderSettings,
  role: string | null | undefined,
): Promise<ReminderSyncResult> {
  await saveLineReminder(settings);
  const api = await loadNotifications({ local: true });
  return syncLineReminder(api, {
    signedIn: true,
    role,
    settings,
    askPermission: true,
    android: Platform.OS === 'android',
  });
}

/** Выход из аккаунта: напоминание этому телефону больше не нужно. */
export async function cancelLineReminderOnSignOut(): Promise<void> {
  await cancelLineReminder(await loadNotifications({ local: true }));
}

/**
 * Корневой layout: после входа исполнителя ставит утреннее «Пора на линию»
 * (если включено и уведомления разрешены), а нажатие на него открывает
 * ленту. Для заказчика модуль уведомлений здесь не грузится.
 */
export function useLineReminderSync(token: string | null, role: string | null | undefined) {
  const eligible = Boolean(token) && lineReminderEligible(role);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    (async () => {
      const [settings, api] = await Promise.all([
        loadLineReminder(),
        loadNotifications({ local: true }),
      ]);
      if (cancelled) return;
      await syncLineReminder(api, {
        signedIn: true,
        role,
        settings,
        askPermission: true,
        android: Platform.OS === 'android',
        stillWanted: () => !cancelled,
      });
    })().catch((error) => console.warn('[line-reminder] skipped', error));
    return () => {
      cancelled = true;
    };
  }, [eligible, role]);

  useEffect(() => {
    if (!eligible) return;
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    void loadNotifications({ local: true }).then((Notifications) => {
      if (!Notifications || cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { kind?: string } | undefined;
        if (data?.kind !== LINE_REMINDER_KIND) return;
        // Лента — кабинет исполнителя: из «Режима заказчика» тоже туда.
        setAppMode('provider');
        router.push('/feed' as never);
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [eligible]);
}
