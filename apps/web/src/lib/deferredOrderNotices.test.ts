import { beforeEach, describe, expect, it, vi } from 'vitest';

// «Пригласи друга»: who hears of a new order now, who 5 minutes later, and
// the flush that sends the rest once. Prisma is mocked; delivery is recorded.

const order = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
};
const prisma = {
  order,
  company: { findMany: vi.fn() },
  equipmentCategory: {
    findMany: vi.fn(async () => [{ id: 'cat1', slug: 'excavators', parentId: null }]),
  },
  user: { findUnique: vi.fn(async () => ({ email: 'x@example.com', phone: null })) },
  notificationSettings: { findUnique: vi.fn(async () => null) },
  pushToken: { findMany: vi.fn(async () => []), deleteMany: vi.fn() },
};
vi.mock('@specai/database', () => ({ prisma, HOUSE_COMPANY_ID: 'house' }));
const delivered: { userId: string; early: boolean; type: string }[] = [];
vi.mock('./notifications/deliver', () => ({
  deliver: vi.fn(
    async (
      recipient: { userId: string },
      _prefs: unknown,
      event: { type: string; early?: boolean },
    ) => {
      delivered.push({ userId: recipient.userId, early: Boolean(event.early), type: event.type });
      return {};
    },
  ),
}));

const { notifyProvidersAboutOrder } = await import('./notifications/notifyUser');
const { flushDeferredOrderNotices, tickDeferredOrderNotices } =
  await import('./deferredOrderNotices');

const NOW = new Date('2026-10-17T09:00:00Z');
const LATER = new Date('2026-10-30T00:00:00Z');

function openOrder(extra: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    status: 'OPEN',
    customerId: 'customer',
    categoryId: 'cat1',
    description: 'Нужен экскаватор',
    desiredStartDate: new Date('2026-10-20T06:00:00Z'),
    source: 'SITE',
    category: { name: 'Экскаваторы' },
    location: { latitude: 55.74, longitude: 52.4, city: 'Набережные Челны' },
    earlyNotifiedUserIds: [],
    othersNotifyAt: null,
    othersNotifiedAt: null,
    ...extra,
  };
}

function company(id: string, users: { id: string; priorityUntil?: Date | null }[]) {
  return {
    id,
    baseLat: 55.75,
    baseLon: 52.41,
    baseAddress: 'Набережные Челны',
    deliveryRadiusKm: 50,
    equipment: [{ categoryId: 'cat1' }],
    users: users.map((user) => ({ priorityUntil: null, ...user })),
  };
}

const who = () => delivered.map((item) => `${item.userId}${item.early ? '!' : ''}`).sort();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  delivered.length = 0;
  order.findUnique.mockReset();
  order.findMany.mockReset();
  order.update.mockReset();
  order.updateMany.mockReset();
  order.update.mockResolvedValue({});
  prisma.company.findMany.mockReset();
});

describe('notifyProvidersAboutOrder', () => {
  it('tells the bonus holders now and defers the others by 5 minutes', async () => {
    order.findUnique.mockResolvedValue(openOrder());
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'a' }]),
      company('c2', [{ id: 'b', priorityUntil: LATER }, { id: 'b2' }]),
      company('c3', [{ id: 'c' }]),
    ]);
    await notifyProvidersAboutOrder('o1');
    // The whole company with the bonus hears early, with the line about it.
    expect(who()).toEqual(['b!', 'b2!']);
    expect(order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        earlyNotifiedUserIds: ['b', 'b2'],
        othersNotifyAt: new Date(NOW.getTime() + 5 * 60_000),
        othersNotifiedAt: null,
      },
    });
  });

  it('tells everyone at once when nobody holds the bonus', async () => {
    order.findUnique.mockResolvedValue(openOrder());
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'a' }]),
      company('c2', [{ id: 'b', priorityUntil: new Date('2026-10-01T00:00:00Z') }]),
    ]);
    await notifyProvidersAboutOrder('o1');
    expect(who()).toEqual(['a', 'b']);
    expect(order.update).not.toHaveBeenCalled();
  });

  it('tells everyone at once when only bonus holders are matched', async () => {
    order.findUnique.mockResolvedValue(openOrder());
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'a', priorityUntil: LATER }]),
      company('c2', [{ id: 'b', priorityUntil: LATER }]),
    ]);
    await notifyProvidersAboutOrder('o1');
    expect(who()).toEqual(['a', 'b']);
    expect(order.update).not.toHaveBeenCalled();
  });

  it('never tells the customer of the order, even with the bonus', async () => {
    order.findUnique.mockResolvedValue(openOrder());
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'customer', priorityUntil: LATER }]),
      company('c2', [{ id: 'b' }]),
    ]);
    await notifyProvidersAboutOrder('o1');
    expect(who()).toEqual(['b']);
  });

  it('closes a waiting delayed alert when the order is published again to everyone', async () => {
    order.findUnique.mockResolvedValue(
      openOrder({ othersNotifyAt: new Date(NOW.getTime() + 60_000), othersNotifiedAt: null }),
    );
    order.updateMany.mockResolvedValue({ count: 1 });
    prisma.company.findMany.mockResolvedValue([company('c1', [{ id: 'a' }])]);
    await notifyProvidersAboutOrder('o1');
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', othersNotifiedAt: null },
      data: { othersNotifiedAt: NOW },
    });
    expect(who()).toEqual(['a']);
  });

  it('tells everyone at once when the delay cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    order.findUnique.mockResolvedValue(openOrder());
    order.update.mockRejectedValue(new Error('column missing'));
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'a' }]),
      company('c2', [{ id: 'b', priorityUntil: LATER }]),
    ]);
    await notifyProvidersAboutOrder('o1');
    expect(who()).toEqual(['a', 'b']);
  });
});

describe('flushDeferredOrderNotices', () => {
  it('costs one query when nothing is due', async () => {
    order.findMany.mockResolvedValue([]);
    expect(await flushDeferredOrderNotices(NOW)).toEqual({ due: 0, sent: 0, skipped: 0 });
    expect(order.findMany).toHaveBeenCalledWith({
      where: { othersNotifiedAt: null, othersNotifyAt: { lte: NOW } },
      select: { id: true },
      orderBy: { othersNotifyAt: 'asc' },
      take: 20,
    });
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('sends once to the rest: not the early ones, not the customer', async () => {
    order.findMany.mockResolvedValue([{ id: 'o1' }]);
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUnique.mockResolvedValue(openOrder({ earlyNotifiedUserIds: ['b'] }));
    prisma.company.findMany.mockResolvedValue([
      company('c1', [{ id: 'a' }, { id: 'customer' }]),
      company('c2', [{ id: 'b', priorityUntil: LATER }]),
      company('c3', [{ id: 'c' }]),
    ]);
    expect(await flushDeferredOrderNotices(NOW)).toEqual({ due: 1, sent: 1, skipped: 0 });
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', othersNotifiedAt: null },
      data: { othersNotifiedAt: NOW },
    });
    expect(who()).toEqual(['a', 'c']);
  });

  it('sends nothing when another call claimed the order first', async () => {
    order.findMany.mockResolvedValue([{ id: 'o1' }]);
    order.updateMany.mockResolvedValue({ count: 0 });
    expect(await flushDeferredOrderNotices(NOW)).toEqual({ due: 0, sent: 0, skipped: 0 });
    expect(order.findUnique).not.toHaveBeenCalled();
    expect(delivered).toEqual([]);
  });

  it('claims and skips an order that is no longer open', async () => {
    order.findMany.mockResolvedValue([{ id: 'o1' }]);
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUnique.mockResolvedValue(openOrder({ status: 'MATCHED' }));
    expect(await flushDeferredOrderNotices(NOW)).toEqual({ due: 1, sent: 0, skipped: 1 });
    expect(order.updateMany).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual([]);
  });

  it('gives the order back when matching fails, so the next tick retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    order.findMany.mockResolvedValue([{ id: 'o1' }]);
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUnique.mockRejectedValue(new Error('pool timeout'));
    expect(await flushDeferredOrderNotices(NOW)).toEqual({ due: 0, sent: 0, skipped: 0 });
    expect(order.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'o1', othersNotifiedAt: NOW },
      data: { othersNotifiedAt: null },
    });
    expect(delivered).toEqual([]);
  });

  it('takes one order per user request, the full batch from the cron', async () => {
    order.findMany.mockResolvedValue([]);
    await tickDeferredOrderNotices('line');
    expect(order.findMany.mock.calls[0]?.[0].take).toBe(1);
    await tickDeferredOrderNotices('cron', 50);
    expect(order.findMany.mock.calls[1]?.[0].take).toBe(20);
  });

  it('never fails the route it rides on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    order.findMany.mockRejectedValue(new Error('db down'));
    expect(await tickDeferredOrderNotices('feed')).toBeNull();
  });

  it('never sends twice: a second run finds nothing due', async () => {
    order.findMany.mockResolvedValueOnce([{ id: 'o1' }]).mockResolvedValueOnce([]);
    order.updateMany.mockResolvedValue({ count: 1 });
    order.findUnique.mockResolvedValue(openOrder({ earlyNotifiedUserIds: ['b'] }));
    prisma.company.findMany.mockResolvedValue([company('c1', [{ id: 'a' }])]);
    await flushDeferredOrderNotices(NOW);
    await flushDeferredOrderNotices(NOW);
    expect(who()).toEqual(['a']);
  });
});
