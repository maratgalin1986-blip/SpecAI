// Rate limits that survive a cold start (audit 2026-11-08, №4). The counters
// of lib/rateLimit.ts live in the memory of one serverless instance, so on
// Vercel every instance starts from zero and parallel requests spread over
// instances pass the limit. Here the same key is also counted in the
// database (RateLimitWindow, one row per keyed hash and fixed window), after
// the in-memory check, which stays the first fast layer. When the database
// is unreachable the in-memory answer stands: a limit must never take the
// site down with the database. Keys are stored as an HMAC, never as the raw
// IP or e-mail.
import { createHmac } from 'node:crypto';
import {
  isRateLimited,
  recordAttempt,
  resetRateLimit,
  type RateLimitOptions,
  type RateLimitResult,
} from './rateLimit';

/** The part of Prisma's RateLimitWindow delegate this module uses. */
export interface RateLimitStore {
  upsert(args: {
    where: { id: string };
    create: { id: string; keyHash: string; windowStart: Date; count: number; expiresAt: Date };
    update: { count: { increment: number } };
    select: { count: true };
  }): Promise<{ count: number }>;
  findUnique(args: {
    where: { id: string };
    select: { count: true };
  }): Promise<{ count: number } | null>;
  deleteMany(args: { where: { keyHash: string } | { expiresAt: { lt: Date } } }): Promise<unknown>;
}

/** Expired rows are swept on about one record in this many. */
const SWEEP_EVERY = 50;

export function rateLimitKeyHash(key: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET || 'rate-limit')
    .update(key)
    .digest('hex');
}

function windowOf(now: number, windowMs: number) {
  const start = Math.floor(now / windowMs) * windowMs;
  return { start, end: start + windowMs };
}

function rowId(keyHash: string, windowStart: number): string {
  return `${keyHash}:${windowStart}`;
}

function limited(end: number, now: number): RateLimitResult {
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((end - now) / 1000)) };
}

function onStoreError(error: unknown): void {
  // One line, no key: the key may be an address or an e-mail.
  console.error('[rateLimit] database counter unavailable, in-memory limit only', error);
}

/**
 * Counts this call: the in-memory limit first, then the database window.
 * The database count includes this call, so `limit` requests pass and the
 * next one is refused — the same rule as checkRateLimit.
 */
export async function durableCheck(
  key: string,
  options: RateLimitOptions,
  store: RateLimitStore | null | undefined,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const memory = isRateLimited(key, options, now);
  if (!memory.ok) return memory;
  recordAttempt(key, options, now);
  if (!store) return { ok: true, retryAfterSec: 0 };
  const { start, end } = windowOf(now, options.windowMs);
  const keyHash = rateLimitKeyHash(key);
  try {
    const row = await store.upsert({
      where: { id: rowId(keyHash, start) },
      create: {
        id: rowId(keyHash, start),
        keyHash,
        windowStart: new Date(start),
        count: 1,
        expiresAt: new Date(end),
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    void sweep(store, now);
    return row.count > options.limit ? limited(end, now) : { ok: true, retryAfterSec: 0 };
  } catch (error) {
    onStoreError(error);
    return { ok: true, retryAfterSec: 0 };
  }
}

/**
 * Only checks (for limits that count failures, not requests): the in-memory
 * window, then the database window of the key.
 */
export async function durableIsLimited(
  key: string,
  options: RateLimitOptions,
  store: RateLimitStore | null | undefined,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const memory = isRateLimited(key, options, now);
  if (!memory.ok || !store) return memory;
  const { start, end } = windowOf(now, options.windowMs);
  try {
    const row = await store.findUnique({
      where: { id: rowId(rateLimitKeyHash(key), start) },
      select: { count: true },
    });
    return row && row.count >= options.limit ? limited(end, now) : { ok: true, retryAfterSec: 0 };
  } catch (error) {
    onStoreError(error);
    return { ok: true, retryAfterSec: 0 };
  }
}

/** Records one failure for the key, in memory and in the database. */
export async function durableRecord(
  key: string,
  options: RateLimitOptions,
  store: RateLimitStore | null | undefined,
  now: number = Date.now(),
): Promise<void> {
  recordAttempt(key, options, now);
  if (!store) return;
  const { start, end } = windowOf(now, options.windowMs);
  const keyHash = rateLimitKeyHash(key);
  try {
    await store.upsert({
      where: { id: rowId(keyHash, start) },
      create: {
        id: rowId(keyHash, start),
        keyHash,
        windowStart: new Date(start),
        count: 1,
        expiresAt: new Date(end),
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    void sweep(store, now);
  } catch (error) {
    onStoreError(error);
  }
}

/** Forgets the key (after a successful sign-in), in memory and in the database. */
export async function durableReset(
  key: string,
  store: RateLimitStore | null | undefined,
): Promise<void> {
  resetRateLimit(key);
  if (!store) return;
  try {
    await store.deleteMany({ where: { keyHash: rateLimitKeyHash(key) } });
  } catch (error) {
    onStoreError(error);
  }
}

/** Expired windows of every key, swept on about one record in SWEEP_EVERY. */
async function sweep(store: RateLimitStore, now: number): Promise<void> {
  if (Math.floor(Math.random() * SWEEP_EVERY) !== 0) return;
  try {
    await store.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  } catch (error) {
    onStoreError(error);
  }
}
