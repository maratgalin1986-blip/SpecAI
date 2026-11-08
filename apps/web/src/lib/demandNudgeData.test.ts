import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small in-memory stand-in for the tables lib/demandNudgeData.ts touches.
const HOUSE = 'specplast16-house';
const KAZAN = { lat: 55.7963, lon: 49.1088 };

interface FakeUser {
  id: string;
  role: string;
  companyId: string | null;
}
interface FakeCompany {
  id: string;
  isProvider: boolean;
  baseLat: number | null;
  baseLon: number | null;
  baseAddress: string | null;
  deliveryRadiusKm: number | null;
}
interface FakeMachine {
  companyId: string;
  categoryId: string;
  status: string;
}
interface FakeOrder {
  id: string;
  status: string;
  createdAt: Date;
  categoryId: string | null;
  customerCompanyId: string | null;
  /** Companies whose machines already bid on it. */
  bidCompanyIds?: string[];
  location: { latitude: number | null; longitude: number | null; city: string } | null;
}
interface FakePresence {
  userId: string;
  companyId: string;
  online: boolean;
  updatedAt: Date;
  onlineSince: Date | null;
  timeZone: string | null;
}
interface FakeSettings {
  id: string;
  userId: string;
  demandNudge: boolean;
  demandNudgeSentAt: Date | null;
}

const db = {
  users: [] as FakeUser[],
  companies: [] as FakeCompany[],
  machines: [] as FakeMachine[],
  orders: [] as FakeOrder[],
  presence: [] as FakePresence[],
  settings: [] as FakeSettings[],
};

// The fake reads only the few Prisma shapes lib/demandNudgeData.ts writes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

function settingsMatches(row: FakeSettings, where: Where): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.demandNudge !== undefined && row.demandNudge !== where.demandNudge) return false;
  if (where.demandNudgeSentAt instanceof Date) {
    if (row.demandNudgeSentAt?.getTime() !== where.demandNudgeSentAt.getTime()) return false;
  }
  if (where.OR) {
    return (where.OR as Where[]).some((cond) =>
      cond.demandNudgeSentAt === null
        ? row.demandNudgeSentAt === null
        : row.demandNudgeSentAt !== null &&
          row.demandNudgeSentAt.getTime() < cond.demandNudgeSentAt.lt.getTime(),
    );
  }
  return true;
}

const newSettings = (userId: string): FakeSettings => ({
  id: `s-${userId}`,
  userId,
  demandNudge: true,
  demandNudgeSentAt: null,
});

const prisma = {
  order: {
    findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
      db.orders
        .filter((row) => row.status === where.status)
        .filter((row) => row.createdAt.getTime() >= where.createdAt.gte.getTime())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take)
        .map((row) => ({
          categoryId: row.categoryId,
          customer: { companyId: row.customerCompanyId },
          bids: (row.bidCompanyIds ?? []).map((companyId) => ({ equipment: { companyId } })),
          location: row.location && { ...row.location, addressLine: '' },
        })),
    ),
  },
  company: {
    findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
      db.companies
        .filter((company) => company.isProvider === where.isProvider)
        .filter((company) => company.id !== where.id.not)
        .filter((company) =>
          db.machines.some(
            (m) => m.companyId === company.id && m.status !== where.equipment.some.status.not,
          ),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, take)
        .map((company) => ({
          ...company,
          equipment: [
            ...new Set(
              db.machines
                .filter((m) => m.companyId === company.id && m.status !== 'RETIRED')
                .map((m) => m.categoryId),
            ),
          ].map((categoryId) => ({ categoryId })),
          users: db.users
            .filter((user) => user.companyId === company.id && user.role === 'PROVIDER_ADMIN')
            .map((user) => ({ id: user.id })),
        })),
    ),
  },
  equipmentCategory: {
    findMany: vi.fn(async () => [
      { id: 'excavators', slug: 'excavators', parentId: null },
      { id: 'cranes', slug: 'cranes', parentId: null },
    ]),
  },
  linePresence: {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      db.presence.filter(
        (row) =>
          where.companyId.in.includes(row.companyId) &&
          row.online === where.OR[0].online &&
          row.updatedAt.getTime() >= where.OR[0].updatedAt.gte.getTime(),
      ),
    ),
  },
  notificationSettings: {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      db.settings.filter((row) => where.userId.in.includes(row.userId)),
    ),
    findUnique: vi.fn(
      async ({ where }: { where: Where }) =>
        db.settings.find((row) => row.userId === where.userId) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<FakeSettings> }) => {
      const rows = db.settings.filter((row) => settingsMatches(row, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
    create: vi.fn(async ({ data }: { data: Partial<FakeSettings> & { userId: string } }) => {
      if (db.settings.some((row) => row.userId === data.userId)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { ...newSettings(data.userId), ...data };
      db.settings.push(row);
      return row;
    }),
    upsert: vi.fn(
      async ({
        where,
        update,
        create,
      }: {
        where: Where;
        update: Partial<FakeSettings>;
        create: Partial<FakeSettings> & { userId: string };
      }) => {
        const row = db.settings.find((item) => item.userId === where.userId);
        if (row) return Object.assign(row, update);
        const created = { ...newSettings(create.userId), ...create };
        db.settings.push(created);
        return created;
      },
    ),
  },
};

vi.mock('@specai/database', () => ({ prisma, HOUSE_COMPANY_ID: HOUSE }));
vi.mock('./notifications/notifyUser', () => ({ notifyUser: vi.fn() }));

const { claimDemandNudge, demandNudgeEnabled, sendDemandNudges, setDemandNudge } =
  await import('./demandNudgeData');

// 10:00 in Moscow; the Moscow day began at 2026-10-22T21:00:00Z.
const now = new Date('2026-10-23T07:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const HOUR = 3_600_000;

const company = (id: string, extra: Partial<FakeCompany> = {}): FakeCompany => ({
  id,
  isProvider: true,
  baseLat: KAZAN.lat,
  baseLon: KAZAN.lon,
  baseAddress: 'Казань, ул. Тихорецкая, 5',
  deliveryRadiusKm: null,
  ...extra,
});
const order = (id: string, extra: Partial<FakeOrder> = {}): FakeOrder => ({
  id,
  status: 'OPEN',
  createdAt: new Date('2026-10-23T05:00:00Z'),
  categoryId: 'excavators',
  customerCompanyId: null,
  location: { latitude: 55.8, longitude: 49.2, city: 'Казань' },
  ...extra,
});

beforeEach(() => {
  db.companies = [
    company('c1'),
    company('c2'),
    company('c3'),
    company('c-far', { baseLat: 43.1, baseLon: 131.9, baseAddress: 'Владивосток' }),
    company('c-retired'),
    company('c-customer', { isProvider: false }),
    company(HOUSE),
  ];
  db.machines = [
    { companyId: 'c1', categoryId: 'excavators', status: 'AVAILABLE' },
    { companyId: 'c2', categoryId: 'cranes', status: 'RENTED' },
    { companyId: 'c3', categoryId: 'excavators', status: 'AVAILABLE' },
    { companyId: 'c-far', categoryId: 'excavators', status: 'AVAILABLE' },
    { companyId: 'c-retired', categoryId: 'excavators', status: 'RETIRED' },
    { companyId: 'c-customer', categoryId: 'excavators', status: 'AVAILABLE' },
    { companyId: HOUSE, categoryId: 'excavators', status: 'AVAILABLE' },
  ];
  db.users = [
    { id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'c1' },
    { id: 'u-op', role: 'PROVIDER_OPERATOR', companyId: 'c1' },
    { id: 'u2', role: 'PROVIDER_ADMIN', companyId: 'c2' },
    { id: 'u3', role: 'PROVIDER_ADMIN', companyId: 'c3' },
    { id: 'u-far', role: 'PROVIDER_ADMIN', companyId: 'c-far' },
    { id: 'u-retired', role: 'PROVIDER_ADMIN', companyId: 'c-retired' },
    { id: 'u-cust-co', role: 'PROVIDER_ADMIN', companyId: 'c-customer' },
    { id: 'u-house', role: 'PROVIDER_ADMIN', companyId: HOUSE },
  ];
  db.orders = [
    order('o1'),
    // Only the city is known: the base address names it.
    order('o2', { location: { latitude: null, longitude: null, city: 'Казань' } }),
    order('o-crane', { categoryId: 'cranes' }),
    // 23:59 Moscow time yesterday: not today's.
    order('o-yesterday', { createdAt: new Date('2026-10-22T20:59:00Z') }),
    // A chat import waiting for moderation is not a real open order.
    order('o-review', { status: 'PENDING_REVIEW' }),
    // Placed by c1's own manager: demand for the others, not for c1.
    order('o-own', { customerCompanyId: 'c1' }),
  ];
  db.presence = [];
  db.settings = [];
  vi.clearAllMocks();
});

const delivered = { push: { ok: true } } as const;
const run = (
  notify: (userId: string, count: number) => Promise<object>,
  extra: { now?: Date; deadline?: number; maxPerRun?: number } = {},
) =>
  sendDemandNudges({
    now,
    deadline: Date.now() + 10_000,
    notify: notify as never,
    ...extra,
  });

describe('«Спрос рядом»', () => {
  it('tells each provider manager how many of today’s open orders fit his machinery nearby', async () => {
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    const result = await run(notify);
    expect(notify.mock.calls.sort()).toEqual([
      ['u1', 2], // o1, o2 (its own o-own is not counted)
      ['u2', 1], // o-crane
      ['u3', 3], // o1, o2, o-own
    ]);
    expect(result).toEqual({ orders: 4, sent: 3, skipped: 0, failed: 0 });
  });

  it('never goes to the house fleet, machinists, customers, far or retired fleets', async () => {
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    await run(notify);
    const told = notify.mock.calls.map(([id]) => id);
    for (const id of ['u-house', 'u-op', 'u-far', 'u-retired', 'u-cust-co']) {
      expect(told).not.toContain(id);
    }
    expect(prisma.company.findMany.mock.calls[0]![0].where.id).toEqual({ not: HOUSE });
  });

  it('sends nothing outside 09:00–12:00 Moscow time and reads nothing', async () => {
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    for (const iso of ['2026-10-23T05:59:00Z', '2026-10-23T09:00:00Z']) {
      expect(await run(notify, { now: new Date(iso) })).toEqual({ skipped: 'window' });
    }
    expect(notify).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('sends nothing when no order of today fits', async () => {
    db.orders = [order('o-yesterday', { createdAt: new Date('2026-10-22T20:59:00Z') })];
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    expect(await run(notify)).toEqual({ orders: 0, sent: 0, skipped: 0, failed: 0 });
    expect(prisma.company.findMany).not.toHaveBeenCalled();
    // Orders today, but none for this machinery or place: nobody is told.
    db.orders = [order('o-far', { location: { latitude: 59.9, longitude: 30.3, city: 'СПб' } })];
    expect(await run(notify)).toMatchObject({ orders: 1, sent: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips every manager of a company with a machine on the line now, not a stale one', async () => {
    db.presence = [
      // c1's machinist went on the line: its manager u1 is not told.
      {
        userId: 'u-op',
        companyId: 'c1',
        online: true,
        updatedAt: later(-60_000),
        onlineSince: later(-HOUR),
        timeZone: null,
      },
      // c2's position is older than PRESENCE_FRESH_MS: it is not on the line.
      {
        userId: 'u2',
        companyId: 'c2',
        online: true,
        updatedAt: later(-20 * 60_000),
        onlineSince: later(-HOUR),
        timeZone: null,
      },
      // c3 went off the line.
      {
        userId: 'u3',
        companyId: 'c3',
        online: false,
        updatedAt: later(-60_000),
        onlineSince: null,
        timeZone: null,
      },
    ];
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    const result = await run(notify);
    expect(notify.mock.calls.map(([id]) => id).sort()).toEqual(['u2', 'u3']);
    expect(result).toMatchObject({ sent: 2, skipped: 1 });
    expect(prisma.linePresence.findMany.mock.calls[0]![0].where.companyId.in.sort()).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('does not count the orders the company already bid on', async () => {
    db.orders = db.orders.map((row) =>
      row.id === 'o1'
        ? { ...row, bidCompanyIds: ['c3'] }
        : row.id === 'o2'
          ? { ...row, bidCompanyIds: ['c1', 'c3'] }
          : row,
    );
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    await run(notify);
    expect(notify.mock.calls.sort()).toEqual([
      ['u1', 1], // o1 (bid on o2)
      ['u2', 1], // o-crane
      ['u3', 1], // o-own (bid on o1 and o2)
    ]);
    // Bid on everything it could take: nothing to tell (the day's claims cleared).
    db.settings = [];
    db.orders = [order('o1', { bidCompanyIds: ['c1', 'c3'] })];
    notify.mockClear();
    expect(await run(notify)).toMatchObject({ orders: 1, sent: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('is sent once a Moscow day: a later run the same day sends nothing, the next day does', async () => {
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    await run(notify);
    expect(notify).toHaveBeenCalledTimes(3);
    const again = await run(notify, { now: later(HOUR) }); // 11:00 MSK
    expect(again).toMatchObject({ sent: 0, skipped: 3 });
    expect(notify).toHaveBeenCalledTimes(3);
    // The next Moscow day, with orders of that day.
    const tomorrow = later(24 * HOUR);
    db.orders = [order('o-next', { createdAt: later(23 * HOUR) })];
    await run(notify, { now: tomorrow });
    expect(
      notify.mock.calls
        .slice(3)
        .map(([id]) => id)
        .sort(),
    ).toEqual(['u1', 'u3']);
  });

  it('two runs at once claim a user only once', async () => {
    const claims = await Promise.all([claimDemandNudge('u1', now), claimDemandNudge('u1', now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('keeps the day when every channel failed: a broken channel is not retried every 5 minutes', async () => {
    const notify = vi.fn(async (userId: string, _count: number): Promise<object> =>
      userId === 'u1' ? { telegram: { ok: false, error: 'blocked' } } : {},
    );
    const result = await run(notify);
    expect(result).toMatchObject({ sent: 0, failed: 1, skipped: 2 });
    expect(db.settings.find((row) => row.userId === 'u1')?.demandNudgeSentAt).toEqual(now);
    expect(db.settings.find((row) => row.userId === 'u2')?.demandNudgeSentAt).toEqual(now);
    // The next run the same day sends nothing (the next day is covered above).
    notify.mockImplementation(async () => delivered);
    await run(notify, { now: later(5 * 60_000) });
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('starts nothing after the deadline and stops at the cap; the rest are told next time', async () => {
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    expect(await run(notify, { deadline: Date.now() - 1 })).toMatchObject({
      sent: 0,
      stopped: 'deadline',
    });
    expect(notify).not.toHaveBeenCalled();
    expect(await run(notify, { maxPerRun: 2 })).toMatchObject({ sent: 2, stopped: 'limit' });
    expect(await run(notify, { maxPerRun: 2 })).toMatchObject({ sent: 1 });
    expect(new Set(notify.mock.calls.map(([id]) => id))).toEqual(new Set(['u1', 'u2', 'u3']));
  });

  it('the switch in «Уведомления» turns it off and on', async () => {
    expect(await demandNudgeEnabled('u1')).toBe(true);
    await setDemandNudge('u1', false);
    expect(await demandNudgeEnabled('u1')).toBe(false);
    const notify = vi.fn(async (_userId: string, _count: number) => delivered);
    await run(notify);
    expect(notify.mock.calls.map(([id]) => id).sort()).toEqual(['u2', 'u3']);
    await setDemandNudge('u1', true);
    expect(await demandNudgeEnabled('u1')).toBe(true);
  });
});
