import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small in-memory stand-in for the tables lib/aktualnoData.ts touches.
const HOUSE = 'specplast16-house';

interface FakeUser {
  id: string;
  role: string;
  companyId: string | null;
}
interface FakeCompany {
  id: string;
  isProvider: boolean;
}
interface FakeMachine {
  id: string;
  companyId: string;
  status: string;
  hourlyRate: number | null;
  dailyRate: number;
  availableFrom: Date | null;
  availabilityUpdatedAt: Date | null;
}
interface FakeSettings {
  id: string;
  userId: string;
  priceAsk: boolean;
  priceAskSentAt: Date | null;
}

const db = {
  users: [] as FakeUser[],
  companies: [] as FakeCompany[],
  machines: [] as FakeMachine[],
  settings: [] as FakeSettings[],
};

// The fake reads only the few Prisma shapes lib/aktualnoData.ts writes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

function userMatches(user: FakeUser, where: Where): boolean {
  if (where.role && user.role !== where.role) return false;
  if (where.companyId?.not && user.companyId === where.companyId.not) return false;
  if (where.id?.gt && !(user.id > where.id.gt)) return false;
  if (where.id?.lte && !(user.id <= where.id.lte)) return false;
  if (where.company) {
    const company = db.companies.find((item) => item.id === user.companyId);
    if (!company || company.isProvider !== where.company.isProvider) return false;
    const notStatus = where.company.equipment.some.status.not;
    if (!db.machines.some((m) => m.companyId === company.id && m.status !== notStatus)) {
      return false;
    }
  }
  return true;
}

function settingsMatches(row: FakeSettings, where: Where): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.priceAsk !== undefined && row.priceAsk !== where.priceAsk) return false;
  if (where.priceAskSentAt instanceof Date) {
    if (row.priceAskSentAt?.getTime() !== where.priceAskSentAt.getTime()) return false;
  }
  if (where.OR) {
    return (where.OR as Where[]).some((cond) =>
      cond.priceAskSentAt === null
        ? row.priceAskSentAt === null
        : row.priceAskSentAt !== null &&
          row.priceAskSentAt.getTime() <= cond.priceAskSentAt.lte.getTime(),
    );
  }
  return true;
}

function machineMatches(row: FakeMachine, where: Where): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
  if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
  if (where.status?.not && row.status === where.status.not) return false;
  if (where.NOT?.companyId && row.companyId === where.NOT.companyId) return false;
  return true;
}

const appSettings = new Map<string, string>();
const prisma = {
  appSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      appSettings.has(where.key) ? { key: where.key, value: appSettings.get(where.key)! } : null,
    ),
    upsert: vi.fn(
      async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        appSettings.set(where.key, update.value);
        return { key: where.key, value: update.value };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
      appSettings.delete(where.key);
      return { count: 1 };
    }),
  },
  user: {
    findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
      db.users
        .filter((user) => userMatches(user, where))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, take)
        .map((user) => ({ id: user.id })),
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
      const row = { id: `s-${data.userId}`, priceAsk: true, priceAskSentAt: null, ...data };
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
        const created = {
          id: `s-${create.userId}`,
          priceAsk: true,
          priceAskSentAt: null,
          ...create,
        };
        db.settings.push(created);
        return created;
      },
    ),
  },
  equipment: {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      db.machines.filter((row) => machineMatches(row, where)).map((row) => ({ id: row.id })),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<FakeMachine> }) => {
      const rows = db.machines.filter((row) => machineMatches(row, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    }),
  },
  $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
};

vi.mock('@specai/database', () => ({ prisma, HOUSE_COMPANY_ID: HOUSE }));
vi.mock('./notifications/notifyUser', () => ({ notifyUser: vi.fn() }));

const { claimPriceAsk, priceAskEnabled, saveAktualno, sendWeeklyPriceAsk, setPriceAsk } =
  await import('./aktualnoData');

const now = new Date('2026-10-19T05:00:00Z');
const machine = (id: string, companyId: string, status = 'AVAILABLE'): FakeMachine => ({
  id,
  companyId,
  status,
  hourlyRate: 3000,
  dailyRate: 24000,
  availableFrom: null,
  availabilityUpdatedAt: null,
});

beforeEach(() => {
  db.companies = [
    { id: 'c1', isProvider: true },
    { id: 'c2', isProvider: true },
    { id: 'c-empty', isProvider: true },
    { id: 'c-retired', isProvider: true },
    { id: 'c-customer', isProvider: false },
    { id: HOUSE, isProvider: true },
  ];
  db.machines = [
    machine('e1', 'c1'),
    machine('e2', 'c1', 'RENTED'),
    machine('e3', 'c2'),
    machine('e-retired', 'c-retired', 'RETIRED'),
    machine('e-cust', 'c-customer'),
    machine('e-house', HOUSE),
  ];
  db.users = [
    { id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'c1' },
    { id: 'u2', role: 'PROVIDER_ADMIN', companyId: 'c2' },
    { id: 'u-op', role: 'PROVIDER_OPERATOR', companyId: 'c1' },
    { id: 'u-cust', role: 'CUSTOMER', companyId: null },
    { id: 'u-cust-co', role: 'PROVIDER_ADMIN', companyId: 'c-customer' },
    { id: 'u-empty', role: 'PROVIDER_ADMIN', companyId: 'c-empty' },
    { id: 'u-retired', role: 'PROVIDER_ADMIN', companyId: 'c-retired' },
    { id: 'u-house', role: 'PROVIDER_ADMIN', companyId: HOUSE },
    { id: 'u-off', role: 'PROVIDER_ADMIN', companyId: 'c2' },
  ];
  db.settings = [{ id: 's-off', userId: 'u-off', priceAsk: false, priceAskSentAt: null }];
  appSettings.clear();
  vi.clearAllMocks();
});

const delivered = { telegram: { ok: true } } as const;

describe('the weekly question', () => {
  it('goes only to provider managers with machinery, never the house fleet, machinists, customers or those who switched it off', async () => {
    const notify = vi.fn(async (_userId: string) => delivered);
    const result = await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify });
    expect(notify.mock.calls.map(([id]) => id).sort()).toEqual(['u1', 'u2']);
    expect(result).toMatchObject({ sent: 2, failed: 0 });
    expect(result.stopped).toBeUndefined();
  });

  it('is sent once a week: a second run the same morning sends nothing', async () => {
    const notify = vi.fn(async (_userId: string) => delivered);
    await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify });
    const again = await sendWeeklyPriceAsk({
      now: new Date(now.getTime() + 3_600_000),
      deadline: Date.now() + 10_000,
      notify,
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(again.sent).toBe(0);
    // A week later it is due again.
    await sendWeeklyPriceAsk({
      now: new Date(now.getTime() + 7 * 86_400_000),
      deadline: Date.now() + 10_000,
      notify,
    });
    expect(notify).toHaveBeenCalledTimes(4);
  });

  it('starts nothing after the deadline and goes on with the rest next time', async () => {
    const notify = vi.fn(async (_userId: string) => delivered);
    const late = await sendWeeklyPriceAsk({ now, deadline: Date.now() - 1, notify });
    expect(late).toMatchObject({ sent: 0, stopped: 'deadline' });
    expect(notify).not.toHaveBeenCalled();
    const next = await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify });
    expect(next.sent).toBe(2);
  });

  it('gives the week back when every channel failed, keeps it when nothing was reachable', async () => {
    const notify = vi.fn(async (userId: string) =>
      userId === 'u1' ? { telegram: { ok: false, error: 'down' } } : {},
    );
    const result = await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify });
    expect(result).toMatchObject({ sent: 0, failed: 1, skipped: expect.any(Number) });
    expect(db.settings.find((row) => row.userId === 'u1')?.priceAskSentAt).toBeNull();
    expect(db.settings.find((row) => row.userId === 'u2')?.priceAskSentAt).toEqual(now);
  });

  it('a capped run goes on next time where it stopped, so everybody is asked in turn', async () => {
    db.users = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      role: 'PROVIDER_ADMIN',
      companyId: 'c1',
    }));
    const notify = vi.fn(async (_userId: string) => delivered);
    const first = await sendWeeklyPriceAsk({
      now,
      deadline: Date.now() + 10_000,
      notify,
      maxPerRun: 2,
    });
    expect(first.stopped).toBe('limit');
    // A week later the first ones are due again, but the run starts after them.
    const nextWeek = new Date(now.getTime() + 7 * 86_400_000);
    notify.mockClear();
    await sendWeeklyPriceAsk({
      now: nextWeek,
      deadline: Date.now() + 10_000,
      notify,
      maxPerRun: 2,
    });
    const asked = notify.mock.calls.map(([id]) => id);
    expect(asked.some((id) => id === 'p0' || id === 'p1')).toBe(false);
    // And then wraps around to the beginning.
    notify.mockClear();
    await sendWeeklyPriceAsk({
      now: nextWeek,
      deadline: Date.now() + 10_000,
      notify,
      maxPerRun: 10,
    });
    expect(notify.mock.calls.map(([id]) => id).sort()).toEqual(['p0', 'p1', 'p4']);
  });

  it('a provider whose message failed is tried again by the next run, not a round later', async () => {
    db.users = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      role: 'PROVIDER_ADMIN',
      companyId: 'c1',
    }));
    const notify = vi.fn(async (userId: string) =>
      userId === 'p1' ? { telegram: { ok: false, error: 'down' } } : delivered,
    );
    // p0 sent, p1 failed (given back), p2 sent, stop at the cap of 2.
    const first = await sendWeeklyPriceAsk({
      now,
      deadline: Date.now() + 10_000,
      notify,
      maxPerRun: 2,
    });
    expect(first).toMatchObject({ sent: 2, failed: 1, stopped: 'limit' });
    notify.mockClear();
    notify.mockImplementation(async () => delivered);
    await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify, maxPerRun: 2 });
    expect(notify.mock.calls.map(([id]) => id)).toEqual(['p1', 'p3']);
  });

  it('two runs at once claim a user only once', async () => {
    const claims = await Promise.all([claimPriceAsk('u1', now), claimPriceAsk('u1', now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('the switch in «Уведомления» turns it off and on', async () => {
    expect(await priceAskEnabled('u1')).toBe(true);
    await setPriceAsk('u1', false);
    expect(await priceAskEnabled('u1')).toBe(false);
    const notify = vi.fn(async (_userId: string) => delivered);
    await sendWeeklyPriceAsk({ now, deadline: Date.now() + 10_000, notify });
    expect(notify.mock.calls.map(([id]) => id)).toEqual(['u2']);
    await setPriceAsk('u1', true);
    expect(await priceAskEnabled('u1')).toBe(true);
  });
});

describe('«Сохранить»', () => {
  const provider = { role: 'PROVIDER_ADMIN', companyId: 'c1' };
  const item = (id: string) => ({
    id,
    hourlyRate: 3500,
    dailyRate: 28000,
    availability: { kind: 'tomorrow' as const },
  });

  it('updates the prices and the free day of the company’s own machines', async () => {
    const result = await saveAktualno(provider, [item('e1'), item('e2')], now);
    expect(result).toEqual({ ok: true, saved: 2 });
    const e1 = db.machines.find((row) => row.id === 'e1')!;
    expect(e1).toMatchObject({ hourlyRate: 3500, dailyRate: 28000 });
    expect(e1.availableFrom).toEqual(new Date('2026-10-20T00:00:00.000Z'));
    expect(e1.availabilityUpdatedAt).toEqual(now);
  });

  it('refuses the whole save when one machine is someone else’s, and changes nothing', async () => {
    const result = await saveAktualno(provider, [item('e1'), item('e3')], now);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(db.machines.find((row) => row.id === 'e1')!.hourlyRate).toBe(3000);
    expect(db.machines.find((row) => row.id === 'e3')!.hourlyRate).toBe(3000);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never touches the house fleet, even for its own managers', async () => {
    const house = await saveAktualno(
      { role: 'PROVIDER_ADMIN', companyId: HOUSE },
      [item('e-house')],
      now,
    );
    expect(house).toMatchObject({ ok: false, status: 403 });
    const other = await saveAktualno(provider, [item('e-house')], now);
    expect(other).toMatchObject({ ok: false, status: 404 });
    expect(db.machines.find((row) => row.id === 'e-house')!.availabilityUpdatedAt).toBeNull();
  });

  it('machinists and customers cannot save', async () => {
    expect(
      await saveAktualno({ role: 'PROVIDER_OPERATOR', companyId: 'c1' }, [item('e1')], now),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await saveAktualno({ role: 'CUSTOMER', companyId: null }, [item('e1')], now),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('refuses a past «busy until» before touching anything', async () => {
    const result = await saveAktualno(
      provider,
      [{ ...item('e1'), availability: { kind: 'busy', until: '2026-10-01' } }],
      now,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(prisma.equipment.updateMany).not.toHaveBeenCalled();
  });
});
