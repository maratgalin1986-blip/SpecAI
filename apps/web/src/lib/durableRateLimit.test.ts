import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  durableCheck,
  durableIsLimited,
  durableRecord,
  durableReset,
  rateLimitKeyHash,
  type RateLimitStore,
} from './durableRateLimit';

/** A RateLimitWindow table in memory, shared by «several instances». */
function fakeStore() {
  const rows = new Map<string, { keyHash: string; count: number; expiresAt: Date }>();
  const store: RateLimitStore = {
    async upsert({ where, create, update }) {
      const row = rows.get(where.id);
      if (row) {
        row.count += update.count.increment;
        return { count: row.count };
      }
      rows.set(where.id, {
        keyHash: create.keyHash,
        count: create.count,
        expiresAt: create.expiresAt,
      });
      return { count: create.count };
    },
    async findUnique({ where }) {
      const row = rows.get(where.id);
      return row ? { count: row.count } : null;
    },
    async deleteMany({ where }) {
      for (const [id, row] of rows) {
        if (
          'keyHash' in where ? row.keyHash === where.keyHash : row.expiresAt < where.expiresAt.lt
        ) {
          rows.delete(id);
        }
      }
    },
  };
  return { store, rows };
}

const options = { limit: 3, windowMs: 60_000 };
let n = 0;
const key = () => `test:${Date.now()}:${(n += 1)}`;
const T0 = 1_700_000_000_000;

describe('durableCheck', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refuses the request past the limit even when the in-memory counter is empty', async () => {
    const { store } = fakeStore();
    const k = key();
    // Another instance already counted three requests in this window.
    await store.upsert({
      where: { id: `${rateLimitKeyHash(k)}:${T0 - (T0 % options.windowMs)}` },
      create: {
        id: `${rateLimitKeyHash(k)}:${T0 - (T0 % options.windowMs)}`,
        keyHash: rateLimitKeyHash(k),
        windowStart: new Date(T0 - (T0 % options.windowMs)),
        count: 3,
        expiresAt: new Date(T0 + options.windowMs),
      },
      update: { count: { increment: 0 } },
      select: { count: true },
    });
    const result = await durableCheck(k, options, store, T0);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it('passes `limit` requests and refuses the next one', async () => {
    const { store } = fakeStore();
    const k = key();
    for (let i = 0; i < options.limit; i += 1) {
      expect((await durableCheck(k, options, store, T0 + i)).ok).toBe(true);
    }
    expect((await durableCheck(k, options, store, T0 + 10)).ok).toBe(false);
  });

  it('stores only a hash of the key', async () => {
    const { store, rows } = fakeStore();
    await durableCheck('leads:203.0.113.7', options, store, T0);
    expect(JSON.stringify([...rows])).not.toContain('203.0.113.7');
  });

  it('keeps working on the in-memory limit alone when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: RateLimitStore = {
      upsert: async () => {
        throw new Error('db down');
      },
      findUnique: async () => {
        throw new Error('db down');
      },
      deleteMany: async () => {
        throw new Error('db down');
      },
    };
    const k = key();
    for (let i = 0; i < options.limit; i += 1) {
      expect((await durableCheck(k, options, broken, T0 + i)).ok).toBe(true);
    }
    expect((await durableCheck(k, options, broken, T0 + 10)).ok).toBe(false);
    expect((await durableCheck(key(), options, null, T0)).ok).toBe(true);
  });
});

describe('durableIsLimited / durableRecord / durableReset (failures only)', () => {
  it('counts recorded failures across instances and forgets them on reset', async () => {
    const { store } = fakeStore();
    const k = key();
    expect((await durableIsLimited(k, options, store, T0)).ok).toBe(true);
    for (let i = 0; i < options.limit; i += 1) await durableRecord(k, options, store, T0 + i);
    expect((await durableIsLimited(k, options, store, T0 + 10)).ok).toBe(false);
    await durableReset(k, store);
    expect((await durableIsLimited(k, options, store, T0 + 11)).ok).toBe(true);
  });

  it('a new window starts clean', async () => {
    const { store } = fakeStore();
    const k = key();
    for (let i = 0; i < options.limit; i += 1) await durableRecord(k, options, store, T0 + i);
    expect((await durableIsLimited(k, options, store, T0 + 2 * options.windowMs)).ok).toBe(true);
  });
});
