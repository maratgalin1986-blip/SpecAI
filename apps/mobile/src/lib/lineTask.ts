import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, putLinePresence } from './api';
import { REPORT_INTERVAL_MS } from './line';
import { STORAGE_KEYS, getItem } from './storage';

/**
 * Фоновая отправка положения «на линии» (сборка APK): задача TaskManager
 * получает координаты и с выключенным экраном, пока исполнитель на линии,
 * и шлёт их в PUT /api/line с машиной из настроек. Точки приходят раз в
 * REPORT_INTERVAL_MS и без движения (distanceInterval 0), чтобы стоящая
 * машина не пропадала с карты. В Expo Go фоновой задачи нет — там работает
 * только отправка из открытого приложения (useLineReporter).
 */
export const LINE_TASK = 'iistroyka24-line-position';

/** Expo Go не держит фоновые задачи Android надёжно; в APK — да. */
export function backgroundLocationSupported(): boolean {
  return Constants.appOwnership !== 'expo';
}

/** Не чаще, чем раз в полминуты: iOS может присылать точки чаще таймера. */
const MIN_SEND_GAP_MS = REPORT_INTERVAL_MS / 2;
let lastSentAt = 0;

TaskManager.defineTask(LINE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations[locations.length - 1];
  if (!last) return;
  if (Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
  try {
    const equipmentId = await getItem(STORAGE_KEYS.lineEquipmentId);
    await putLinePresence({
      online: true,
      lat: last.coords.latitude,
      lon: last.coords.longitude,
      equipmentId: equipmentId ?? null,
    });
    lastSentAt = Date.now();
  } catch (caught) {
    // Вышли из аккаунта, машина занята или не выбрана — фон больше не нужен;
    // при обрыве сети следующая точка уйдёт сама.
    if (caught instanceof ApiError && [400, 401, 403, 409].includes(caught.status)) {
      await stopBackgroundLine();
    }
  }
});

export async function startBackgroundLine(): Promise<boolean> {
  if (!backgroundLocationSupported()) return false;
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return false;
  if (await Location.hasStartedLocationUpdatesAsync(LINE_TASK)) return true;
  await Location.startLocationUpdatesAsync(LINE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: REPORT_INTERVAL_MS,
    // 0 — точка приходит по таймеру и без движения (пульс стоящей машины).
    distanceInterval: 0,
    deferredUpdatesInterval: REPORT_INTERVAL_MS,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Вы на линии',
      notificationBody:
        'Заказчики видят вашу машину на карте. Чтобы уйти с линии, откройте приложение.',
      notificationColor: '#D97706',
    },
  });
  return true;
}

export async function stopBackgroundLine(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LINE_TASK)) {
      await Location.stopLocationUpdatesAsync(LINE_TASK);
    }
  } catch {
    // Задача и так не запущена.
  }
}
