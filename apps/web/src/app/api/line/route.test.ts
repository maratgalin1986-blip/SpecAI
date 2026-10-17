import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const presenceFindUnique = vi.fn();
const upsert = vi.fn();
const equipmentFindUnique = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: {
    linePresence: { findUnique: presenceFindUnique, upsert },
    equipment: { findUnique: equipmentFindUnique },
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/shiftAccess', () => ({ operatorOf: vi.fn() }));

const { PUT } = await import('./route');

let userSeq = 0;

async function put(body: unknown) {
  const response = await PUT(
    new NextRequest('http://localhost/api/line', { method: 'PUT', body: JSON.stringify(body) }),
  );
  return response.status;
}

const online = { online: true, lat: 55.74, lon: 52.4, equipmentId: 'e1' };
const row = (over: Record<string, unknown> = {}) => ({
  online: true,
  equipmentId: 'e1',
  note: null,
  updatedAt: new Date(),
  ...over,
});

/** The `onlineSince` the upsert wrote (update branch), or undefined when left as is. */
const writtenSince = () => upsert.mock.calls[0]?.[0].update.onlineSince as Date | undefined;

describe('PUT /api/line — when the machine went online', () => {
  beforeEach(() => {
    presenceFindUnique.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({});
    equipmentFindUnique.mockReset();
    equipmentFindUnique.mockResolvedValue({ companyId: 'c1', status: 'AVAILABLE' });
    getRequestUser.mockReset();
    // A new user each time: the per-user throttle does not carry over.
    getRequestUser.mockResolvedValue({
      id: `u${++userSeq}`,
      role: 'PROVIDER_ADMIN',
      companyId: 'c1',
    });
  });

  it('stamps going online from offline or from nothing', async () => {
    presenceFindUnique.mockResolvedValue(row({ online: false }));
    expect(await put(online)).toBe(200);
    expect(writtenSince()).toBeInstanceOf(Date);
    upsert.mockClear();
    presenceFindUnique.mockResolvedValue(null);
    await put(online);
    expect(upsert.mock.calls[0]?.[0].create.onlineSince).toBeInstanceOf(Date);
  });

  it('keeps it while the same machine stays online, renews it for another machine', async () => {
    presenceFindUnique.mockResolvedValue(row({ note: 'x' }));
    await put(online);
    expect(writtenSince()).toBeUndefined();
    upsert.mockClear();
    presenceFindUnique.mockResolvedValue(row({ equipmentId: 'e0' }));
    await put(online);
    expect(writtenSince()).toBeInstanceOf(Date);
  });

  it('renews it when the phone comes back after its row went stale', async () => {
    presenceFindUnique.mockResolvedValue(row({ updatedAt: new Date(Date.now() - 20 * 60_000) }));
    await put(online);
    expect(writtenSince()).toBeInstanceOf(Date);
  });

  it('does not stamp going offline', async () => {
    presenceFindUnique.mockResolvedValue(row());
    await put({ online: false });
    expect(writtenSince()).toBeUndefined();
  });
});
