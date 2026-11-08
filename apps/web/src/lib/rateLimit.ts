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

/**
 * Лимит заявок с одного IP: общий для форм сайта (/api/leads) и заявок из
 * ИИ-чата (/api/ai/agents), ключ `leads:<ip>` — один счётчик на оба канала.
 */
export const LEAD_RATE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 10 * 60 * 1000 };

// Каждый бакет помнит своё окно: ключи с разными windowMs чистятся независимо.
const buckets = new Map<string, { windowMs: number; timestamps: number[] }>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const limited = isRateLimited(key, { limit, windowMs }, now);
  if (!limited.ok) return limited;
  recordAttempt(key, { limit, windowMs }, now);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Только проверка, без учёта этого вызова: для лимитов, где считаются не
 * запросы, а неудачи (вход с неверным паролем). Неудачу затем записывает
 * recordAttempt, успех сбрасывает resetRateLimit.
 */
export function isRateLimited(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const windowStart = now - windowMs;
  const recent = (buckets.get(key)?.timestamps ?? []).filter((ts) => ts > windowStart);
  if (recent.length >= limit) {
    buckets.set(key, { windowMs, timestamps: recent });
    const oldest = recent[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Записывает одну попытку по ключу (окно нужно, чтобы бакет чистился по нему). */
export function recordAttempt(
  key: string,
  { windowMs }: RateLimitOptions,
  now: number = Date.now(),
): void {
  const windowStart = now - windowMs;
  const recent = (buckets.get(key)?.timestamps ?? []).filter((ts) => ts > windowStart);
  recent.push(now);
  buckets.set(key, { windowMs, timestamps: recent });

  // Периодически чистим устаревшие ключи, чтобы Map не рос бесконечно —
  // каждый по его собственному окну, а не по окну текущего вызова.
  if (buckets.size > 10_000) {
    for (const [k, bucket] of buckets) {
      const bucketStart = now - bucket.windowMs;
      if (bucket.timestamps.every((ts) => ts <= bucketStart)) buckets.delete(k);
    }
  }
}

/** Забывает попытки по ключу — после успешного входа. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
