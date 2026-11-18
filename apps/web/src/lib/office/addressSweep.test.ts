import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@specai/database', () => ({ prisma: {} }));
import {
  SWEEP_CURSOR_KEY,
  SWEEP_STATS_KEY,
  sweepAddresses,
  type SweepDb,
  type SweepRow,
} from './addressSweep';
import { resetDomainCache, type DnsLike } from './mailCheck';

const NOW = new Date('2026-11-18T10:00:00Z');
const gone = () => Object.assign(new Error('x'), { code: 'ENOTFOUND' });

const resolver: DnsLike = {
  resolveMx: async (domain) => {
    if (domain.startsWith('dead')) throw gone();
    return [{ exchange: `mx.${domain}`, priority: 10 }];
  },
  resolve4: async () => {
    throw gone();
  },
  resolve6: async () => {
    throw gone();
  },
};

function fakeDb(rows: SweepRow[], settings: Record<string, string> = {}) {
  const store = new Map(Object.entries(settings));
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const db: SweepDb = {
    appSetting: {
      findMany: async () => [...store].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, update }) => {
        store.set(where.key, update.value);
      },
    },
    prospect: {
      findMany: async () => rows.filter((r) => r.email),
      updateMany: async ({ where, data }) => {
        const w = where as { id: string; email: string };
        const row = rows.find((r) => r.id === w.id && r.email === w.email);
        if (!row) return { count: 0 };
        updates.push({ id: row.id, data: data as Record<string, unknown> });
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { db, store, updates, rows };
}

const row = (id: string, email: string | null, n: number): SweepRow => ({
  id,
  email,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, n)),
});

beforeEach(() => resetDomainCache());

describe('sweepAddresses', () => {
  it('снимает нерабочие адреса, рабочие не трогает, пишет итог и закладку', async () => {
    const { db, store, updates, rows } = fakeDb([
      row('a', 'info@firma.ru', 1),
      row('b', 'info@dead-firma.ru', 2),
      row('c', 'x@mail.ru', 3),
      row('d', 'ivan@mial.ru', 4),
    ]);
    const result = await sweepAddresses(NOW, { db, resolver });
    expect(result).toMatchObject({ checked: 4, removed: 2 });
    expect(result.reasons).toEqual({
      'у домена нет почтового сервера': 1,
      'опечатка в домене': 1,
    });
    expect(updates.map((u) => u.id)).toEqual(['b', 'd']);
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ email: null });
    expect(rows.find((r) => r.id === 'a')!.email).toBe('info@firma.ru');
    const stats = JSON.parse(store.get(SWEEP_STATS_KEY)!);
    expect(stats).toMatchObject({ checked: 4, removed: 2 });
    expect(store.get(SWEEP_CURSOR_KEY)).toBe('2026-11-01T00:00:04.000Z|d');
  });

  it('итоги складываются между проходами; пустая очередь — ничего не пишет', async () => {
    const first = fakeDb([row('a', 'a@dead-one.ru', 1)]);
    await sweepAddresses(NOW, { db: first.db, resolver });
    const second = fakeDb([row('b', 'b@dead-two.ru', 2)], {
      [SWEEP_STATS_KEY]: first.store.get(SWEEP_STATS_KEY)!,
    });
    await sweepAddresses(NOW, { db: second.db, resolver });
    expect(JSON.parse(second.store.get(SWEEP_STATS_KEY)!)).toMatchObject({
      checked: 2,
      removed: 2,
    });
    const empty = fakeDb([]);
    expect(await sweepAddresses(NOW, { db: empty.db, resolver })).toEqual({
      checked: 0,
      removed: 0,
      reasons: {},
    });
    expect(empty.store.size).toBe(0);
  });

  it('сбой базы не роняет проход', async () => {
    const db = {
      appSetting: {
        findMany: async () => {
          throw new Error('db down');
        },
        upsert: async () => undefined,
      },
      prospect: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    } as unknown as SweepDb;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await sweepAddresses(NOW, { db, resolver })).toEqual({
      checked: 0,
      removed: 0,
      reasons: {},
    });
    spy.mockRestore();
  });
});
