import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { putLinePresence } from './api';
import { REPORT_DISTANCE_M, REPORT_INTERVAL_MS } from './line';

export type PositionPermission = 'unknown' | 'granted' | 'denied';

/**
 * Исполнитель «на линии»: пока переключатель включён и приложение открыто,
 * телефон отправляет своё положение и выбранную машину (PUT /api/line) раз
 * в REPORT_INTERVAL_MS или при сдвиге на REPORT_DISTANCE_M. Выключение
 * переключателя снимает машину с карты заказчиков.
 */
export function useLineReporter(online: boolean, equipmentId: string | null) {
  const [permission, setPermission] = useState<PositionPermission>('unknown');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const equipmentRef = useRef(equipmentId);
  equipmentRef.current = equipmentId;

  useEffect(() => {
    if (!online) {
      setLastSentAt(null);
      putLinePresence({ online: false }).catch(() => undefined);
      return;
    }
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const send = async (coords: { latitude: number; longitude: number }) => {
      try {
        await putLinePresence({
          online: true,
          lat: coords.latitude,
          lon: coords.longitude,
          equipmentId: equipmentRef.current,
        });
        if (!cancelled) {
          setLastSentAt(new Date());
          setError(null);
        }
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : 'Не удалось отправить положение');
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
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: REPORT_INTERVAL_MS,
          distanceInterval: REPORT_DISTANCE_M,
        },
        (position) => void send(position.coords),
      );
    })().catch(() => !cancelled && setPermission('denied'));
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [online]);

  // Смена машины уходит сразу, с последним известным положением.
  useEffect(() => {
    if (!online || !lastSentAt) return;
    Location.getLastKnownPositionAsync()
      .then((position) => {
        if (!position) return;
        return putLinePresence({
          online: true,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          equipmentId,
        });
      })
      .catch(() => undefined);
  }, [equipmentId]);

  return { permission, lastSentAt, error };
}
