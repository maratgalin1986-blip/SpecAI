import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
vi.mock('./storage', () => ({
  STORAGE_KEYS: { lineReminder: 'specai.lineReminder' },
  getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => void stored.set(key, value)),
}));

const {
  cancelLineReminder,
  DEFAULT_LINE_REMINDER,
  LINE_REMINDER_BODY,
  LINE_REMINDER_ID,
  LINE_REMINDER_TITLE,
  lineReminderEligible,
  lineReminderHint,
  loadLineReminder,
  parseLineReminder,
  saveLineReminder,
  syncLineReminder,
} = await import('./lineReminder');
type ReminderApi = import('./lineReminder').ReminderApi;

/** expo-notifications as the reminder uses it: a fake with the SDK 57 trigger types. */
function fakeNotifications(permission: 'granted' | 'denied' | 'undetermined' = 'granted') {
  const scheduled = new Map<string, unknown>();
  const api = {
    getPermissionsAsync: vi.fn(async () => ({ status: permission, canAskAgain: true })),
    requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => void scheduled.delete(id)),
    scheduleNotificationAsync: vi.fn(async (request: { identifier: string; trigger?: unknown }) => {
      scheduled.set(request.identifier, request);
      return request.identifier;
    }),
    setNotificationChannelAsync: vi.fn(async () => null),
    SchedulableTriggerInputTypes: { DAILY: 'daily' },
    AndroidImportance: { DEFAULT: 3 },
  };
  return { api: api as unknown as ReminderApi, mock: api, scheduled };
}

const provider = {
  signedIn: true,
  role: 'PROVIDER_ADMIN',
  settings: DEFAULT_LINE_REMINDER,
};

describe('morning reminder «Пора на линию»', () => {
  beforeEach(() => stored.clear());

  it('cancels the previous one first, then schedules one daily at 07:30', async () => {
    const { api, mock, scheduled } = fakeNotifications();
    expect(await syncLineReminder(api, provider)).toBe('scheduled');
    expect(mock.cancelScheduledNotificationAsync).toHaveBeenCalledWith(LINE_REMINDER_ID);
    expect(mock.cancelScheduledNotificationAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mock.scheduleNotificationAsync.mock.invocationCallOrder[0]!,
    );
    expect(mock.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: LINE_REMINDER_ID,
      content: {
        title: LINE_REMINDER_TITLE,
        body: LINE_REMINDER_BODY,
        data: { kind: 'line-reminder' },
      },
      trigger: { type: 'daily', hour: 7, minute: 30 },
    });
    // Again (every app start): still one reminder, no duplicates.
    await syncLineReminder(api, { ...provider, settings: { enabled: true, time: '06:30' } });
    expect(scheduled.size).toBe(1);
    expect(mock.scheduleNotificationAsync.mock.calls[1]?.[0].trigger).toMatchObject({
      hour: 6,
      minute: 30,
    });
  });

  it('uses its own Android channel', async () => {
    const { api, mock } = fakeNotifications();
    await syncLineReminder(api, { ...provider, android: true });
    expect(mock.setNotificationChannelAsync).toHaveBeenCalledWith('line-reminder', {
      name: 'Напоминание о линии',
      importance: 3,
    });
    expect(mock.scheduleNotificationAsync.mock.calls[0]?.[0].trigger).toMatchObject({
      channelId: 'line-reminder',
    });
  });

  it('only cancels when switched off, signed out or not a provider', async () => {
    for (const options of [
      { ...provider, settings: { enabled: false, time: '07:30' as const } },
      { ...provider, signedIn: false },
      { ...provider, role: 'CUSTOMER' },
      { ...provider, role: 'PROVIDER_OPERATOR' },
    ]) {
      const { api, mock } = fakeNotifications();
      expect(await syncLineReminder(api, options)).toBe('off');
      expect(mock.cancelScheduledNotificationAsync).toHaveBeenCalledWith(LINE_REMINDER_ID);
      expect(mock.scheduleNotificationAsync).not.toHaveBeenCalled();
    }
  });

  it('needs the notification permission; asks only when told to', async () => {
    const denied = fakeNotifications('denied');
    expect(await syncLineReminder(denied.api, provider)).toBe('no-permission');
    expect(denied.mock.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(denied.mock.scheduleNotificationAsync).not.toHaveBeenCalled();
    const asked = fakeNotifications('undetermined');
    expect(await syncLineReminder(asked.api, { ...provider, askPermission: true })).toBe(
      'scheduled',
    );
    expect(asked.mock.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when the person signed out while the permission was asked', async () => {
    const { api, mock } = fakeNotifications('undetermined');
    let signedIn = true;
    mock.requestPermissionsAsync.mockImplementation(async () => {
      signedIn = false;
      return { status: 'granted' };
    });
    const result = await syncLineReminder(api, {
      ...provider,
      askPermission: true,
      stillWanted: () => signedIn,
    });
    expect(result).toBe('off');
    expect(mock.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('sign-out cancels it; no notifications module (web) is not an error', async () => {
    const { api, scheduled } = fakeNotifications();
    await syncLineReminder(api, provider);
    expect(scheduled.size).toBe(1);
    await cancelLineReminder(api);
    expect(scheduled.size).toBe(0);
    await expect(cancelLineReminder(null)).resolves.toBeUndefined();
    expect(await syncLineReminder(null, provider)).toBe('unsupported');
  });

  it('is for the provider company’s manager, who has «Выйти на линию»', () => {
    expect(lineReminderEligible('PROVIDER_ADMIN')).toBe(true);
    expect(lineReminderEligible('PROVIDER_OPERATOR')).toBe(false);
    expect(lineReminderEligible('CUSTOMER')).toBe(false);
    expect(lineReminderEligible(undefined)).toBe(false);
  });

  it('does not nag: «если…»', () => {
    expect(LINE_REMINDER_TITLE).toBe('Пора на линию');
    expect(LINE_REMINDER_BODY).toBe(
      'Выйдите на линию, если сегодня хотите получать бесплатные заявки рядом.',
    );
  });

  it('keeps the setting on this phone, defaults for anything odd', async () => {
    expect(await loadLineReminder()).toEqual({ enabled: true, time: '07:30' });
    await saveLineReminder({ enabled: false, time: '09:00' });
    expect(await loadLineReminder()).toEqual({ enabled: false, time: '09:00' });
    expect(parseLineReminder('{"enabled":true,"time":"05:00"}')).toEqual(DEFAULT_LINE_REMINDER);
    expect(parseLineReminder('not json')).toEqual(DEFAULT_LINE_REMINDER);
    expect(parseLineReminder('null')).toEqual(DEFAULT_LINE_REMINDER);
  });

  it('explains the daily cycle under the switch', () => {
    expect(lineReminderHint({ enabled: true, time: '08:00' }, '21:00')).toBe(
      'Каждое утро в 08:00 на этом телефоне: «Пора на линию». Вечером в 21:00 линия выключается сама.',
    );
    expect(lineReminderHint({ enabled: false, time: '08:00' }, '21:00')).toBe(
      'Напоминания нет. Вечером в 21:00 линия всё равно выключается сама.',
    );
  });
});
