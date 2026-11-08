import * as Location from 'expo-location';
import { toNear, type NearPoint } from './near';

/**
 * Последнее известное положение телефона для поиска адреса — только если
 * доступ к геопозиции уже разрешён: здесь ничего не спрашиваем и не ждём
 * спутников. Нет разрешения или положения — null (поиск по всей России).
 */
export async function phoneNear(): Promise<NearPoint | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
    return toNear(last?.coords);
  } catch {
    return null;
  }
}
