import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { fetchNearbyLine, type BaseMachine, type LiveMachine } from './api';
import { LIVE_REFRESH_MS } from './line';

/**
 * Карта заказчика: положение телефона (если разрешено) и техника на линии
 * вокруг него, перечитывается каждые LIVE_REFRESH_MS. Без разрешения —
 * вся свежая техника, карта по точкам исполнителей или обзором России.
 */
export function useNearbyLine(enabled: boolean) {
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [machines, setMachines] = useState<LiveMachine[]>([]);
  // Свободные машины СпецПласт16 на базе (тот же ответ, поле base).
  const [base, setBase] = useState<BaseMachine[]>([]);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            setMe({ lat: position.coords.latitude, lon: position.coords.longitude });
          }
        }
      } catch {
        // Без геопозиции карта всё равно показывает технику на линии.
      } finally {
        if (!cancelled) setAsked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !asked) return;
    let cancelled = false;
    const load = () =>
      fetchNearbyLine(me)
        .then((data) => {
          if (cancelled) return;
          setMachines(data.machines);
          setBase(data.base ?? []);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, asked, me]);

  return { me, machines, base };
}
