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

describe('PUT /api/line — «на линии на 5 рабочих дней»', () => {
  // Wednesday 2026-10-28, 14:00 Moscow.
  const day = new Date('2026-10-28T11:00:00Z');
  const fridayNext = new Date('2026-11-03T20:59:59.999Z'); // Tuesday 23:59 Moscow: 5 working days
  const written = () => upsert.mock.calls[0]?.[0].update as Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(day);
    presenceFindUnique.mockReset();
    upsert.mockReset();
    upsert.mockImplementation(async ({ update: data }) => ({ ...row(), ...data }));
    update.mockReset();
    equipmentFindUnique.mockReset();
    equipmentFindUnique.mockResolvedValue({
      companyId: 'c1',
      status: 'AVAILABLE',
      location: null,
      company: { baseLat: 55.7, baseLon: 52.3 },
    });
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

  it('going online from the app starts 5 working days (Wednesday → Tuesday)', async () => {
    presenceFindUnique.mockResolvedValue(row({ online: false }));
    const { status, body } = await putFull({ ...online, source: 'foreground' });
    expect(status).toBe(200);
    expect((written().standingUntil as Date).toISOString()).toBe(fridayNext.toISOString());
    expect(written().gpsAt).toBeInstanceOf(Date);
    expect(body.standing).toBe(true);
  });

  it('a heartbeat keeps the running period as it is', async () => {
    presenceFindUnique.mockResolvedValue(
      row({ standingUntil: new Date('2026-10-30T20:59:59.999Z'), note: null }),
    );
    await put({ ...online, lat: 55.75, source: 'foreground' });
    expect(written().standingUntil).toBeUndefined();
    expect(written().standingSince).toBeUndefined();
  });

  it('the app’s own switch-off at 21:00 ends GPS only: the machine stays on the line', async () => {
    vi.setSystemTime(new Date('2026-10-28T18:05:00Z')); // 21:05 Moscow
    presenceFindUnique.mockResolvedValue(
      row({ standingUntil: fridayNext, note: 'Могу сразу', timeZone: 'Europe/Moscow' }),
    );
    await put({ online: false, timeZone: 'Europe/Moscow' });
    expect(written()).toMatchObject({ online: false, equipmentId: 'e1', note: 'Могу сразу' });
    expect(written().standingUntil).toBeUndefined();
  });

  it('«Уйти с линии» during the day ends the period too', async () => {
    presenceFindUnique.mockResolvedValue(row({ standingUntil: fridayNext }));
    await put({ online: false });
    expect(written()).toMatchObject({
      online: false,
      equipmentId: null,
      standingUntil: null,
      standingForever: false,
    });
  });

  it('`standing: off` ends it at any hour', async () => {
    vi.setSystemTime(new Date('2026-10-28T19:00:00Z'));
    presenceFindUnique.mockResolvedValue(row({ standingUntil: fridayNext }));
    await put({ online: false, standing: 'off' });
    expect(written()).toMatchObject({ standingUntil: null, equipmentId: null });
  });

  it('from the cabinet: no position needed, the machine stands at the base; the phone’s session is untouched', async () => {
    presenceFindUnique.mockResolvedValue(row({ online: false, lat: 1, lon: 1 }));
    const { status } = await putFull({
      online: true,
      equipmentId: 'e1',
      standing: 'forever',
      source: 'web',
    });
    expect(status).toBe(200);
    expect(written()).toMatchObject({ online: false, standingForever: true, lat: 55.7, lon: 52.3 });
    expect(written().gpsAt).toBeUndefined();
    expect(written().onlineSince).toBeUndefined();
  });

  it('from the cabinet «до …» writes the end of that day', async () => {
    presenceFindUnique.mockResolvedValue(null);
    await put({
      online: true,
      equipmentId: 'e1',
      standing: 'until',
      until: '2026-11-06',
      source: 'web',
    });
    const created = upsert.mock.calls[0]?.[0].create;
    expect((created.standingUntil as Date).toISOString()).toBe('2026-11-06T20:59:59.999Z');
  });

  it('refuses a past date and a machine with no place to stand', async () => {
    presenceFindUnique.mockResolvedValue(null);
    expect(
      await put({
        online: true,
        equipmentId: 'e1',
        standing: 'until',
        until: '2026-10-01',
        source: 'web',
      }),
    ).toBe(400);
    equipmentFindUnique.mockResolvedValue({
      companyId: 'c1',
      status: 'AVAILABLE',
      location: null,
      company: { baseLat: null, baseLon: null },
    });
    const { status, body } = await putFull({
      online: true,
      equipmentId: 'e1',
      standing: 'days5',
      source: 'web',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('адрес базы');
  });

  it('still refuses a machine of another company', async () => {
    presenceFindUnique.mockResolvedValue(null);
    equipmentFindUnique.mockResolvedValue({
      companyId: 'other',
      status: 'AVAILABLE',
      location: null,
      company: null,
    });
    expect(await put({ online: true, equipmentId: 'e9', standing: 'days5', source: 'web' })).toBe(
      403,
    );
  });
});
