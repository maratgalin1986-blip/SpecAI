import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, putLinePresence } from './api';
import {
  deviceTimeZone,
  LINE_EVENING_OFF_HOUR,
  lineAutoOff,
  localDayHour,
  REPORT_INTERVAL_MS,
  startOfLocalDay,
  type LineAutoOff,
} from './line';
import { parseOnlineSince, setLineAutoOff, setProviderOnline } from './prefs';
import { STORAGE_KEYS, getItem } from './storage';

/**
 * Фоновая отправка положения «на линии» (сборка APK): задача TaskManager
 * получает координаты и с выключенным экраном, пока исполнитель на линии,
 * и шлёт их в PUT /api/line с машиной из настроек. Точки приходят раз в
 * REPORT_INTERVAL_MS и без движения (distanceInterval 0), чтобы стоящая
 * машина не пропадала с карты. В Expo Go фоновой задачи нет — там работает
 * только отправка из открытого приложения (useLineReporter).
 *
 * Вечером (21:00 по времени телефона, line.ts) задача сама снимает машину с
 * линии и останавливается (autoOffLine); сервер тоже не даёт фоновой
 * задаче вернуть машину на линию после этого часа (`autoOff` в ответе).
 */
export const LINE_TASK = 'iistroyka24-line-position';

/** Expo Go не держит фоновые задачи Android надёжно; в APK — да. */
export function backgroundLocationSupported(): boolean {
  return Constants.appOwnership !== 'expo';
}

/** Не чаще, чем раз в полминуты: iOS может присылать точки чаще таймера. */
const MIN_SEND_GAP_MS = REPORT_INTERVAL_MS / 2;
let lastSentAt = 0;

/**
 * Вечернее выключение линии: машина уходит с карты заказчиков, фоновая
 * задача останавливается, переключатель «На линии» выключается, а в ленте
 * остаётся объяснение («Линия выключилась в 21:00. Завтра утром включите
 * снова.»). Работает и из фоновой задачи, когда приложение закрыто.
 */
export async function autoOffLine(off: LineAutoOff): Promise<void> {
  setProviderOnline(false);
  setLineAutoOff(off);
  await stopBackgroundLine();
  await putLinePresence({ online: false, timeZone: deviceTimeZone() }).catch(() => undefined);
}

/** Начало текущей линии из хранилища (фоновая задача живёт и без экранов приложения). */
async function storedLineSince(now: number): Promise<number> {
  return parseOnlineSince(await getItem(STORAGE_KEYS.lineOnlineSince), now);
}

TaskManager.defineTask(LINE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations[locations.length - 1];
  if (!last) return;
  if (Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
  try {
    // Исполнитель уже ушёл с линии (задача не успела остановиться) — не
    // возвращаем машину на карту и не пишем «линия выключилась сама».
    if ((await getItem(STORAGE_KEYS.providerOnline)) === '0') {
      await stopBackgroundLine();
      return;
    }
    // Вечер по времени телефона: снимаемся сами, ничего не отправляя «онлайн».
    // Без сохранённого начала (линия включена в старой версии) — с утра.
    const now = new Date();
    const since = new Date(await storedLineSince(startOfLocalDay(now)));
    const off = lineAutoOff(since, now);
    if (off) {
      await autoOffLine(off);
      return;
    }
    const equipmentId = await getItem(STORAGE_KEYS.lineEquipmentId);
    const report = {
      online: true,
      lat: last.coords.latitude,
      lon: last.coords.longitude,
      equipmentId: equipmentId ?? null,
      timeZone: deviceTimeZone(),
    };
    const result = await putLinePresence({ ...report, source: 'background' });
    lastSentAt = Date.now();
    if (result.autoOff) {
      if (localDayHour(since).hour < LINE_EVENING_OFF_HOUR) {
        // Утренняя линия, а сервер уже видит вечер (часы на минуту
        // расходятся): соглашаемся.
        await autoOffLine({ reason: 'evening', day: localDayHour(since).day });
      } else {
        // Исполнитель сам включил линию после 21:00, но из открытого
        // приложения отправка не дошла (сеть, сразу свернули): телефон
        // знает, что включили вручную, — отправляем как из приложения.
        await putLinePresence({ ...report, source: 'foreground' });
      }
    }
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
