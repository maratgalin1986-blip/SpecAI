import type { NotificationsModule } from './push';
import { STORAGE_KEYS, getItem, setItem } from './storage';

/**
 * Утреннее напоминание «Пора на линию» (владелец, 2026-10-17): исполнители
 * каждое утро выходят на линию, вечером линия выключается сама (line.ts).
 * Это ЛОКАЛЬНОЕ ежедневное уведомление на телефоне исполнителя: по времени
 * телефона (Россия большая), без сети и без сервера, работает и в Expo Go.
 * Ставится, когда входит руководитель компании-исполнителя и уведомления
 * разрешены; снимается при выходе из аккаунта. Включено ли и во сколько —
 * хранится только на этом телефоне.
 */

/** Одно напоминание на телефон: перед постановкой снимаем по этому id — без дублей. */
export const LINE_REMINDER_ID = 'iistroyka24-line-morning';
/** Канал Android для напоминания (тихий, не как заявки). */
export const LINE_REMINDER_CHANNEL = 'line-reminder';
/** `data.kind` уведомления: нажатие открывает ленту. */
export const LINE_REMINDER_KIND = 'line-reminder';

export const LINE_REMINDER_TIMES = ['06:30', '07:00', '07:30', '08:00', '09:00'] as const;
export type LineReminderTime = (typeof LINE_REMINDER_TIMES)[number];

export const LINE_REMINDER_TITLE = 'Пора на линию';
/** «если…» — напоминание приходит и тем, кто уже на линии: без упрёка. */
export const LINE_REMINDER_BODY =
  'Выйдите на линию, если сегодня хотите получать бесплатные заявки рядом.';

export interface LineReminderSettings {
  enabled: boolean;
  time: LineReminderTime;
}

export const DEFAULT_LINE_REMINDER: LineReminderSettings = { enabled: true, time: '07:30' };

/** Сохранённые настройки; всё непонятное — по умолчанию (включено, 07:30). */
export function parseLineReminder(raw: string | null | undefined): LineReminderSettings {
  if (!raw) return DEFAULT_LINE_REMINDER;
  try {
    const value = JSON.parse(raw) as Partial<LineReminderSettings> | null;
    const time = LINE_REMINDER_TIMES.find((option) => option === value?.time);
    return {
      enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_LINE_REMINDER.enabled,
      time: time ?? DEFAULT_LINE_REMINDER.time,
    };
  } catch {
    return DEFAULT_LINE_REMINDER;
  }
}

export async function loadLineReminder(): Promise<LineReminderSettings> {
  return parseLineReminder(await getItem(STORAGE_KEYS.lineReminder));
}

export async function saveLineReminder(settings: LineReminderSettings): Promise<void> {
  try {
    await setItem(STORAGE_KEYS.lineReminder, JSON.stringify(settings));
  } catch {
    // Хранилище недоступно — напоминание всё равно поставлено, до перезапуска.
  }
}

/**
 * Кому напоминать: руководителю компании-исполнителя — у него в ленте есть
 * «Выйти на линию». Машинисту в приложении выйти на линию негде (у него
 * «Мои смены»), поэтому ему напоминание только мешало бы.
 */
export function lineReminderEligible(role: string | null | undefined): boolean {
  return role === 'PROVIDER_ADMIN';
}

/** «07:30» → { hour: 7, minute: 30 }. */
export function reminderHourMinute(time: LineReminderTime): { hour: number; minute: number } {
  const [hour = '7', minute = '30'] = time.split(':');
  return { hour: Number(hour), minute: Number(minute) };
}

export type ReminderApi = Pick<
  NotificationsModule,
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'cancelScheduledNotificationAsync'
  | 'scheduleNotificationAsync'
  | 'setNotificationChannelAsync'
  | 'SchedulableTriggerInputTypes'
  | 'AndroidImportance'
>;

export type ReminderSyncResult = 'scheduled' | 'off' | 'no-permission' | 'unsupported';

/** Снять напоминание (выход из аккаунта, выключили в настройках). */
export async function cancelLineReminder(api: ReminderApi | null): Promise<void> {
  if (!api) return;
  try {
    await api.cancelScheduledNotificationAsync(LINE_REMINDER_ID);
  } catch {
    // Напоминания и не было.
  }
}

/**
 * Привести напоминание на телефоне к настройкам: сначала снимаем прежнее
 * (по id — дублей не бывает), потом, если человек вошёл, он исполнитель,
 * напоминание включено и уведомления разрешены, — ставим ежедневное на
 * выбранное время. `askPermission` — спросить разрешение, если ещё можно.
 */
export async function syncLineReminder(
  api: ReminderApi | null,
  options: {
    signedIn: boolean;
    role: string | null | undefined;
    settings: LineReminderSettings;
    askPermission?: boolean;
    android?: boolean;
    /** Пока ждали разрешения, человек мог выйти из аккаунта — тогда не ставим. */
    stillWanted?: () => boolean;
  },
): Promise<ReminderSyncResult> {
  if (!api) return 'unsupported';
  await cancelLineReminder(api);
  if (!options.signedIn || !lineReminderEligible(options.role) || !options.settings.enabled) {
    return 'off';
  }
  const current = await api.getPermissionsAsync();
  let granted = current.status === 'granted';
  if (!granted && options.askPermission && current.canAskAgain !== false) {
    granted = (await api.requestPermissionsAsync()).status === 'granted';
  }
  if (!granted) return 'no-permission';
  if (options.stillWanted && !options.stillWanted()) return 'off';
  if (options.android) {
    await api.setNotificationChannelAsync(LINE_REMINDER_CHANNEL, {
      name: 'Напоминание о линии',
      importance: api.AndroidImportance.DEFAULT,
    });
  }
  const { hour, minute } = reminderHourMinute(options.settings.time);
  await api.scheduleNotificationAsync({
    identifier: LINE_REMINDER_ID,
    content: {
      title: LINE_REMINDER_TITLE,
      body: LINE_REMINDER_BODY,
      data: { kind: LINE_REMINDER_KIND },
    },
    trigger: {
      type: api.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(options.android ? { channelId: LINE_REMINDER_CHANNEL } : {}),
    },
  });
  return 'scheduled';
}

/** Текст под переключателем в настройках уведомлений. */
export function lineReminderHint(settings: LineReminderSettings, eveningOff: string): string {
  return settings.enabled
    ? `Каждое утро в ${settings.time} на этом телефоне: «${LINE_REMINDER_TITLE}». Вечером в ${eveningOff} линия выключается сама.`
    : `Напоминания нет. Вечером в ${eveningOff} линия всё равно выключается сама.`;
}
