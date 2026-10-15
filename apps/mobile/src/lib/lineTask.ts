import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { putLinePresence } from './api';
import { REPORT_DISTANCE_M, REPORT_INTERVAL_MS } from './line';
import { STORAGE_KEYS, getItem } from './storage';

/**
 * Фоновая отправка положения «на линии» (сборка APK): задача TaskManager
 * получает координаты и с выключенным экраном, пока исполнитель на линии,
 * и шлёт их в PUT /api/line с машиной из настроек. В Expo Go фоновой задачи
 * нет — там работает только отправка из открытого приложения
 * (useLineReporter).
 */
export const LINE_TASK = 'iistroyka24-line-position';

/** Expo Go не держит фоновые задачи Android надёжно; в APK — да. */
export function backgroundLocationSupported(): boolean {
  return Constants.appOwnership !== 'expo';
}

TaskManager.defineTask(LINE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations[locations.length - 1];
  if (!last) return;
  try {
    const equipmentId = await getItem(STORAGE_KEYS.lineEquipmentId);
    await putLinePresence({
      online: true,
      lat: last.coords.latitude,
      lon: last.coords.longitude,
      equipmentId: equipmentId ?? null,
    });
  } catch {
    // Нет сети — следующая точка уйдёт сама.
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
    distanceInterval: REPORT_DISTANCE_M,
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
