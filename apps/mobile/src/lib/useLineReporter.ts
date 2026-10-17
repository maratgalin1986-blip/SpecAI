import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, putLinePresence } from './api';
import { deviceTimeZone, lineAutoOff, REPORT_DISTANCE_M, REPORT_INTERVAL_MS } from './line';
import { startBackgroundLine, stopBackgroundLine } from './lineTask';
import { lineOnlineSince, setLineAutoOff, setProviderOnline } from './prefs';
import { STORAGE_KEYS, setItem } from './storage';

export type PositionPermission = 'unknown' | 'granted' | 'denied';

type Coords = { latitude: number; longitude: number };

const NO_MACHINE_TEXT = 'Отметьте машину «Свободна» — без машины заказчики вас не видят';

/**
 * Вечер по времени телефона (21:00, line.ts): выключает переключатель «На
 * линии» и оставляет в ленте объяснение. Сам уход с линии (PUT online:false и
 * остановку фоновой задачи) делает эффект ниже, увидев выключенный
 * переключатель. true — линия выключена.
 */
export function switchOffIfEvening(now: Date = new Date()): boolean {
  const since = lineOnlineSince();
  if (since === null) return false;
  const off = lineAutoOff(new Date(since), now);
  if (!off) return false;
  setLineAutoOff(off);
  setProviderOnline(false);
  return true;
}

/** Ошибки, после которых повторять отправку бессмысленно: решает исполнитель. */
export function isFinalLineError(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403, 409].includes(error.status);
}

/**
 * Исполнитель «на линии»: пока переключатель включён и приложение открыто,
 * телефон отправляет своё положение и выбранную машину (PUT /api/line) при
 * сдвиге на REPORT_DISTANCE_M и — независимо от движения — раз в
 * REPORT_INTERVAL_MS с последним известным положением, чтобы стоящая машина
 * не пропадала с карты. Выбранная машина записывается в хранилище, чтобы
 * фоновая задача (lineTask.ts) отправляла ту же. Выключение переключателя
 * снимает машину с карты заказчиков. Вечером в 21:00 по времени телефона
 * переключатель выключается сам (switchOffIfEvening) — и при каждой
 * отправке, и по таймеру, и при возвращении в приложение.
 */
export function useLineReporter(online: boolean, equipmentId: string | null) {
  const [permission, setPermission] = useState<PositionPermission>('unknown');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** В APK положение уходит и с выключенным экраном (lineTask.ts). */
  const [background, setBackground] = useState(false);
  const equipmentRef = useRef(equipmentId);
  equipmentRef.current = equipmentId;
  const lastCoords = useRef<Coords | null>(null);
  /** Был ли переключатель включён в этом экране: снимаем с линии только после. */
  const wasOnline = useRef(false);

  // Та же машина — и в фоновой задаче. Пока парк не загрузился (машины ещё
  // нет), сохранённую не трогаем: иначе фоновая задача отправит «без машины»,
  // получит 400 и остановится.
  useEffect(() => {
    if (!online || !equipmentId) return;
    void setItem(STORAGE_KEYS.lineEquipmentId, equipmentId).catch(() => undefined);
  }, [online, equipmentId]);

  useEffect(() => {
    if (!online) {
      setLastSentAt(null);
      setError(null);
      setBackground(false);
      // До загрузки настроек переключатель всегда «выключен»: это не выход с
      // линии, иначе каждый запуск приложения снимал бы исполнителя с карты.
      if (!wasOnline.current) return;
      wasOnline.current = false;
      void stopBackgroundLine();
      putLinePresence({ online: false, timeZone: deviceTimeZone() }).catch(() => undefined);
      return;
    }
    wasOnline.current = true;
    // Линию включили вчера и не выключили — утром приложение открывают уже
    // с выключенной: эффект перезапустится с online=false и снимет машину
    // с карты (wasOnline уже true).
    if (switchOffIfEvening()) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const send = async (coords: Coords) => {
      lastCoords.current = coords;
      if (switchOffIfEvening()) return;
      // Без машины сервер откажет (400): не шлём, а сразу говорим исполнителю.
      if (!equipmentRef.current) {
        if (!cancelled) setError(NO_MACHINE_TEXT);
        return;
      }
      try {
        const result = await putLinePresence({
          online: true,
          lat: coords.latitude,
          lon: coords.longitude,
          equipmentId: equipmentRef.current,
          source: 'foreground',
          timeZone: deviceTimeZone(),
        });
        if (cancelled) return;
        setError(null);
        // Троттлинг сервера: положение уже свежее, время не сдвигаем.
        if (!result.throttled) setLastSentAt(new Date());
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Не удалось отправить положение');
        // Без машины или с занятой машиной на линию не выйти: фон тоже стоп.
        if (isFinalLineError(caught)) void stopBackgroundLine();
      }
    };
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      // В сборке APK — фоновая задача; в Expo Go её нет, остаётся слежение
      // из открытого приложения ниже (оно нужно и в APK для статуса на экране).
      startBackgroundLine()
        .then((started) => !cancelled && setBackground(started))
        .catch(() => undefined);
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: REPORT_INTERVAL_MS,
          distanceInterval: REPORT_DISTANCE_M,
        },
        (position) => void send(position.coords),
      );
      // Пульс: стоящая машина отправляет последнее известное положение раз в минуту.
      heartbeat = setInterval(() => {
        if (cancelled || switchOffIfEvening()) return;
        if (lastCoords.current) {
          void send(lastCoords.current);
          return;
        }
        Location.getLastKnownPositionAsync()
          .then((position) => {
            if (position && !cancelled) void send(position.coords);
          })
          .catch(() => undefined);
      }, REPORT_INTERVAL_MS);
    })().catch(() => !cancelled && setPermission('denied'));
    // Вернулись в приложение после вечера — линия выключается сразу, не через минуту.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !cancelled) switchOffIfEvening();
    });
    return () => {
      cancelled = true;
      subscription?.remove();
      appState.remove();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [online]);

  // Смена машины (и её появление после загрузки парка) уходит сразу, с
  // последним известным положением — как только геопозиция разрешена.
  useEffect(() => {
    if (!online || permission !== 'granted' || !equipmentId) return;
    const known = lastCoords.current;
    (known
      ? Promise.resolve(known)
      : Location.getLastKnownPositionAsync().then((position) => position?.coords ?? null)
    )
      .then((coords) => {
        if (!coords || switchOffIfEvening()) return;
        return putLinePresence({
          online: true,
          lat: coords.latitude,
          lon: coords.longitude,
          equipmentId,
          source: 'foreground',
          timeZone: deviceTimeZone(),
        }).then((result) => {
          setError(null);
          if (!result.throttled) setLastSentAt(new Date());
        });
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Не удалось отправить положение');
      });
    // Положение само уходит по таймеру выше; здесь — только смена машины.
  }, [online, permission, equipmentId]);

  return { permission, lastSentAt, error, background };
}
