import { apiFetch } from './api';

// Каналы уведомлений пользователя (как в личном кабинете на сайте):
// GET/PUT /api/notifications/settings, привязка Telegram и push-токен устройства.

export type NotificationChannelId = 'telegram' | 'push' | 'email' | 'whatsapp' | 'sms';

export interface NotificationChannelView {
  id: NotificationChannelId;
  label: string;
  enabled: boolean;
  /** false — переключатель недоступен («скоро» или не настроено на сервере). */
  available: boolean;
  /** Канал сейчас реально доставляет (выбран и подключён). */
  active: boolean;
  soon: boolean;
  hint: string;
}

export interface NotificationSettings {
  channels: NotificationChannelView[];
  telegram: { linked: boolean; botConfigured: boolean };
  push: { devices: number };
}

export function fetchNotificationSettings() {
  return apiFetch<NotificationSettings>('/api/notifications/settings');
}

export function updateNotificationSettings(
  change: Partial<Record<NotificationChannelId, boolean>>,
) {
  return apiFetch<NotificationSettings>('/api/notifications/settings', {
    method: 'PATCH',
    body: change,
  });
}

/** Одноразовая ссылка t.me/<бот>?start=… (15 минут). */
export function createTelegramLink() {
  return apiFetch<{ url: string; expiresAt: string }>('/api/notifications/telegram', {
    method: 'POST',
  });
}

export function unlinkTelegram() {
  return apiFetch<{ ok: boolean }>('/api/notifications/telegram', { method: 'DELETE' });
}

export function sendTestNotification() {
  return apiFetch<{ message: string }>('/api/notifications/test', { method: 'POST' });
}

export function registerPushToken(token: string, platform: string) {
  return apiFetch<{ ok: boolean }>('/api/mobile/push-token', {
    method: 'POST',
    body: { token, platform },
  });
}
