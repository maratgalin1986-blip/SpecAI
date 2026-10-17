/**
 * Где искать адрес в первую очередь: положение телефона, огрублённое до 0,05°
 * (около 5 км) — хватает, чтобы понять город, но не дом. Сервер добавляет
 * этот город к улице без города («Мира 10») и предпочитает адреса рядом;
 * без положения ищет по всей России, город по умолчанию не подставляется.
 */
export type NearPoint = { lat: number; lon: number };

export function toNear(
  coords: { latitude?: number | null; longitude?: number | null } | null | undefined,
): NearPoint | null {
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const round = (value: number) => Math.round(value * 20) / 20;
  return { lat: round(lat), lon: round(lon) };
}
