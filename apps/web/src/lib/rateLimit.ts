/**
 * Простой in-memory rate limit со скользящим окном.
 *
 * ВНИМАНИЕ: состояние хранится в памяти процесса. При нескольких инстансах
 * (serverless, горизонтальное масштабирование) лимит будет считаться отдельно
 * на каждом инстансе — для общего лимита нужен Redis или аналогичное хранилище.
 */

export interface RateLimitOptions {
  /** Максимум запросов за окно. */
  limit: number;
  /** Длина окна в миллисекундах. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Через сколько секунд можно повторить запрос (0, если ok). */
  retryAfterSec: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const recent = (buckets.get(key) ?? []).filter((ts) => ts > windowStart);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    const oldest = recent[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  recent.push(now);
  buckets.set(key, recent);

  // Периодически чистим устаревшие ключи, чтобы Map не рос бесконечно.
  if (buckets.size > 10_000) {
    for (const [k, timestamps] of buckets) {
      if (timestamps.every((ts) => ts <= windowStart)) buckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0 };
}
