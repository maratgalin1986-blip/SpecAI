import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const presenceFindUnique = vi.fn();
const upsert = vi.fn();
const update = vi.fn();
const equipmentFindUnique = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: {
    linePresence: { findUnique: presenceFindUnique, upsert, update },
    equipment: { findUnique: equipmentFindUnique },
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/shiftAccess', () => ({ operatorOf: vi.fn() }));

const { PUT } = await import('./route');

let userSeq = 0;

async function putFull(body: unknown) {
  const response = await PUT(
    new NextRequest('http://localhost/api/line', { method: 'PUT', body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
}

async function put(body: unknown) {
  return (await putFull(body)).status;
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

describe('PUT /api/line — the evening cutoff', () => {
  // 21:30 in Moscow; the session began at 08:00 Moscow time.
  const evening = new Date('2026-10-17T18:30:00Z');
  const morning = new Date('2026-10-17T05:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(evening);
    presenceFindUnique.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({});
    update.mockReset();
    update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
    equipmentFindUnique.mockReset();
    equipmentFindUnique.mockResolvedValue({ companyId: 'c1', status: 'AVAILABLE' });
    getRequestUser.mockReset();
    getRequestUser.mockResolvedValue({
      id: `u${++userSeq}`,
      role: 'PROVIDER_ADMIN',
      companyId: 'c1',
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a background report after the cutoff and takes the row off the line', async () => {
    presenceFindUnique.mockResolvedValue(
      row({ updatedAt: evening, onlineSince: morning, timeZone: 'Europe/Moscow' }),
    );
    const { status, body } = await putFull({
      ...online,
      source: 'background',
      timeZone: 'Europe/Moscow',
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ online: false, autoOff: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ online: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lets a background report through before the cutoff in the phone’s own zone', async () => {
    // 21:30 in Moscow is 20:30 in Kaliningrad: the session goes on.
    presenceFindUnique.mockResolvedValue(
      row({ updatedAt: evening, onlineSince: new Date('2026-10-17T06:00:00Z') }),
    );
    const { status, body } = await putFull({
      ...online,
      source: 'background',
      timeZone: 'Europe/Kaliningrad',
    });
    expect(status).toBe(200);
    expect(body.autoOff).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0]?.[0].update.timeZone).toBe('Europe/Kaliningrad');
  });

  it('never lets the background task start a new session after the cutoff', async () => {
    presenceFindUnique.mockResolvedValue(row({ online: false, onlineSince: morning }));
    const { body } = await putFull({ ...online, source: 'background', timeZone: 'Europe/Moscow' });
    expect(body).toMatchObject({ online: false, autoOff: true });
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts the provider switching on again from the open app: a new session', async () => {
    presenceFindUnique.mockResolvedValue(row({ updatedAt: evening, onlineSince: morning }));
    const { status, body } = await putFull({
      ...online,
      source: 'foreground',
      timeZone: 'Europe/Moscow',
    });
    expect(status).toBe(200);
    expect(body.autoOff).toBeUndefined();
    expect(writtenSince()).toEqual(evening);
  });

  it('keeps an older app (no source) on the old start, so the map hides it', async () => {
    presenceFindUnique.mockResolvedValue(row({ updatedAt: evening, onlineSince: morning }));
    expect(await put(online)).toBe(200);
    expect(writtenSince()).toBeUndefined();
  });

  it('renews an older app’s session the next morning, so it is not hidden for good', async () => {
    vi.setSystemTime(new Date('2026-10-18T05:00:00Z')); // 08:00 MSK the next day
    presenceFindUnique.mockResolvedValue(
      row({ updatedAt: new Date('2026-10-18T04:59:00Z'), onlineSince: morning }),
    );
    expect(await put(online)).toBe(200);
    expect(writtenSince()).toEqual(new Date('2026-10-18T05:00:00Z'));
  });

  it('continues a late session the provider started after the cutoff', async () => {
    presenceFindUnique.mockResolvedValue(
      row({ updatedAt: evening, onlineSince: new Date('2026-10-17T18:10:00Z') }),
    );
    const { body } = await putFull({ ...online, source: 'background', timeZone: 'Europe/Moscow' });
    expect(body.autoOff).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores a junk time zone and never fails the report over it', async () => {
    presenceFindUnique.mockResolvedValue(row({ online: false }));
    vi.setSystemTime(morning);
    const { status } = await putFull({ ...online, timeZone: 'Mars/Olympus' });
    expect(status).toBe(200);
    expect(upsert.mock.calls[0]?.[0].update.timeZone).toBeUndefined();
    expect(await put({ ...online, timeZone: 42, source: 'nonsense' })).toBe(200);
  });
});
