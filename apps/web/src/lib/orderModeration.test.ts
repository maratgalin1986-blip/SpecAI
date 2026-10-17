import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  groupBy: vi.fn(),
};
const equipmentCategory = { findUnique: vi.fn() };
const appSetting = { deleteMany: vi.fn() };
const queryRaw = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { order, equipmentCategory, appSetting, $queryRaw: queryRaw },
}));

class ModerationOutputError extends Error {}
const moderateChatOrder = vi.fn();
vi.mock('@specai/ai-service', () => ({ moderateChatOrder, ModerationOutputError }));

const notifyProvidersAboutOrder = vi.fn();
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyProvidersAboutOrder }));

const {
  DAILY_AI_BUDGET,
  GIVE_UP_REASON,
  NO_CATEGORY_REASON,
  PAST_DATES_REASON,
  SWEEP_LIMIT,
  aiModerationSummary,
  autoModerateOrder,
  claimModerationCall,
  loadAiDecisions,
  sweepPendingOrders,
} = await import('./orderModeration');

const NOW = new Date('2026-10-17T09:00:00Z');
const HOUR = 3_600_000;

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    status: 'PENDING_REVIEW',
    rawText: 'Кто может завтра экскаватор в Елабугу, траншея 20 метров',
    description: 'Кто может завтра экскаватор в Елабугу, траншея 20 метров',
    sourceChat: 'Стройка Татарстан',
    categoryId: 'cat-exc',
    createdAt: new Date(NOW.getTime() - HOUR),
    desiredStartDate: new Date('2026-10-18T00:00:00Z'),
    desiredEndDate: new Date('2026-10-19T00:00:00Z'),
    category: { slug: 'excavators' },
    location: { city: 'Елабуга' },
    ...overrides,
  };
}

function lastUpdate() {
  return order.updateMany.mock.calls.at(-1)?.[0];
}

describe('autoModerateOrder', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    for (const mock of [
      ...Object.values(order),
      equipmentCategory.findUnique,
      appSetting.deleteMany,
      queryRaw,
      moderateChatOrder,
      notifyProvidersAboutOrder,
    ]) {
      mock.mockReset();
    }
    order.findUnique.mockResolvedValue(pendingOrder());
    order.updateMany.mockResolvedValue({ count: 1 });
    queryRaw.mockResolvedValue([{ value: '1' }]);
    appSetting.deleteMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing without an AI key: the order waits as before', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'skipped',
      reason: 'no-ai',
    });
    expect(order.findUnique).not.toHaveBeenCalled();
    expect(moderateChatOrder).not.toHaveBeenCalled();
  });

  it('publishes a real request and tells the providers', async () => {
    moderateChatOrder.mockResolvedValue({ decision: 'PUBLISH', reason: 'нужен экскаватор' });

    const outcome = await autoModerateOrder('o1', { now: NOW, timeoutMs: 8000 });

    expect(outcome).toEqual({ status: 'published', reason: 'нужен экскаватор' });
    const [input, options] = moderateChatOrder.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      text: pendingOrder().rawText,
      chatTitle: 'Стройка Татарстан',
      categorySlug: 'excavators',
      city: 'Елабуга',
      today: '2026-10-17',
    });
    expect(options).toEqual({ timeoutMs: 8000, maxRetries: 0 });
    const update = lastUpdate();
    expect(update.where).toEqual({ id: 'o1', status: 'PENDING_REVIEW' });
    expect(update.data).toMatchObject({
      status: 'OPEN',
      moderatedBy: 'ai',
      moderationDecision: 'PUBLISH',
      moderationReason: 'нужен экскаватор',
      moderatedAt: NOW,
    });
    expect(update.data.bidsUntil).toBeInstanceOf(Date);
    expect(update.data).not.toHaveProperty('categoryId');
    expect(notifyProvidersAboutOrder).toHaveBeenCalledWith('o1');
  });

  it('takes the machinery type from the AI when the import had none', async () => {
    order.findUnique.mockResolvedValue(pendingOrder({ categoryId: null, category: null }));
    equipmentCategory.findUnique.mockResolvedValue({ id: 'cat-crane' });
    moderateChatOrder.mockResolvedValue({
      decision: 'PUBLISH',
      reason: 'нужен кран',
      categoryHint: 'truck-cranes',
    });

    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toMatchObject({
      status: 'published',
    });
    expect(equipmentCategory.findUnique.mock.calls[0]?.[0].where).toEqual({
      slug: 'truck-cranes',
    });
    expect(lastUpdate().data).toMatchObject({ status: 'OPEN', categoryId: 'cat-crane' });
  });

  it('never publishes without a machinery type', async () => {
    order.findUnique.mockResolvedValue(pendingOrder({ categoryId: null, category: null }));
    moderateChatOrder.mockResolvedValue({ decision: 'PUBLISH', reason: 'нужна техника' });

    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'rejected',
      reason: NO_CATEGORY_REASON,
    });
    expect(lastUpdate().data).toMatchObject({ status: 'CANCELLED', moderationDecision: 'REJECT' });
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('rejects an offer without telling anybody', async () => {
    moderateChatOrder.mockResolvedValue({ decision: 'REJECT', reason: 'сдаёт свою технику' });

    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'rejected',
      reason: 'сдаёт свою технику',
    });
    expect(lastUpdate()).toEqual({
      where: { id: 'o1', status: 'PENDING_REVIEW' },
      data: {
        status: 'CANCELLED',
        moderatedBy: 'ai',
        moderationDecision: 'REJECT',
        moderationReason: 'сдаёт свою технику',
        moderatedAt: NOW,
      },
    });
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('keeps a fresh doubtful order waiting for the next try', async () => {
    moderateChatOrder.mockResolvedValue({ decision: 'UNSURE', reason: 'не ясно, что нужно' });

    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'unsure',
      reason: 'не ясно, что нужно',
    });
    const update = lastUpdate();
    expect(update.data).not.toHaveProperty('status');
    expect(update.data).toMatchObject({ moderatedBy: 'ai', moderationDecision: 'UNSURE' });
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('rejects an order still unclear a day after the import', async () => {
    order.findUnique.mockResolvedValue(
      pendingOrder({ createdAt: new Date(NOW.getTime() - 24 * HOUR) }),
    );
    moderateChatOrder.mockResolvedValue({ decision: 'UNSURE', reason: 'не ясно' });

    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'rejected',
      reason: GIVE_UP_REASON,
    });
    expect(lastUpdate().data).toMatchObject({
      status: 'CANCELLED',
      moderationDecision: 'REJECT',
      moderationReason: 'не удалось понять заявку',
    });
  });

  it('gives up on an order already found unclear without paying for another try', async () => {
    order.findUnique.mockResolvedValue(
      pendingOrder({
        createdAt: new Date(NOW.getTime() - 25 * HOUR),
        moderationDecision: 'UNSURE',
      }),
    );
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'rejected',
      reason: GIVE_UP_REASON,
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(moderateChatOrder).not.toHaveBeenCalled();
  });

  it('counts an answer that is not a verdict as a doubt', async () => {
    moderateChatOrder.mockRejectedValue(new ModerationOutputError('bad'));
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toMatchObject({
      status: 'unsure',
    });
  });

  it('leaves the order waiting when the AI cannot be reached', async () => {
    moderateChatOrder.mockRejectedValue(new Error('connection reset'));
    await expect(autoModerateOrder('o1', { now: NOW })).rejects.toThrow('connection reset');
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('skips an order that is no longer waiting, and keeps the admin decision', async () => {
    order.findUnique.mockResolvedValue(pendingOrder({ status: 'OPEN' }));
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'skipped',
      reason: 'not-pending',
    });
    expect(moderateChatOrder).not.toHaveBeenCalled();

    // Decided by the admin while the AI was thinking: nothing changes.
    order.findUnique.mockResolvedValue(pendingOrder());
    order.updateMany.mockResolvedValue({ count: 0 });
    moderateChatOrder.mockResolvedValue({ decision: 'PUBLISH', reason: 'нужен' });
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toMatchObject({
      status: 'skipped',
    });
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('rejects an order whose dates have passed without asking the AI', async () => {
    order.findUnique.mockResolvedValue(
      pendingOrder({ desiredEndDate: new Date('2026-10-15T00:00:00Z') }),
    );
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'rejected',
      reason: PAST_DATES_REASON,
    });
    expect(moderateChatOrder).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('does not call the AI once the daily budget is used up', async () => {
    queryRaw.mockResolvedValue([]);
    await expect(autoModerateOrder('o1', { now: NOW })).resolves.toEqual({
      status: 'skipped',
      reason: 'budget',
    });
    expect(moderateChatOrder).not.toHaveBeenCalled();
    expect(order.updateMany).not.toHaveBeenCalled();
  });
});

describe('claimModerationCall', () => {
  beforeEach(() => queryRaw.mockReset());

  it('raises the counter of the Moscow day only below the limit', async () => {
    queryRaw.mockResolvedValue([{ value: '12' }]);
    // 22:30 UTC is already the next day in Moscow.
    await expect(claimModerationCall(new Date('2026-10-17T22:30:00Z'))).resolves.toBe(true);
    const [strings, ...values] = queryRaw.mock.calls[0] ?? [];
    expect(strings.join('?')).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(values).toEqual(['ai.moderation.calls:2026-10-18', DAILY_AI_BUDGET]);

    queryRaw.mockResolvedValue([]);
    await expect(claimModerationCall(NOW)).resolves.toBe(false);
  });
});

describe('sweepPendingOrders', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    for (const mock of [...Object.values(order), queryRaw, moderateChatOrder]) mock.mockReset();
    appSetting.deleteMany.mockReset();
    appSetting.deleteMany.mockResolvedValue({ count: 0 });
    order.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(pendingOrder({ id: where.id })),
    );
    order.updateMany.mockResolvedValue({ count: 1 });
    queryRaw.mockResolvedValue([{ value: '1' }]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing without an AI key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const result = await sweepPendingOrders({ now: NOW });
    expect(result).toMatchObject({ enabled: false, checked: 0 });
    expect(order.findMany).not.toHaveBeenCalled();
  });

  it('takes the waiting orders, never tried and oldest first, at most 20', async () => {
    order.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    moderateChatOrder
      .mockResolvedValueOnce({ decision: 'PUBLISH', reason: 'нужен' })
      .mockResolvedValueOnce({ decision: 'REJECT', reason: 'реклама' })
      .mockResolvedValueOnce({ decision: 'UNSURE', reason: 'не ясно' });

    const result = await sweepPendingOrders({ limit: 500, now: NOW });

    const query = order.findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ status: 'PENDING_REVIEW' });
    expect(query.orderBy).toEqual([
      { moderatedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'asc' },
    ]);
    expect(query.take).toBe(SWEEP_LIMIT);
    expect(result).toMatchObject({
      enabled: true,
      checked: 3,
      published: 1,
      rejected: 1,
      unsure: 1,
      errors: 0,
    });
    // Old budget counters are cleaned up, today's is kept.
    expect(appSetting.deleteMany.mock.calls[0]?.[0].where.key).toEqual({
      startsWith: 'ai.moderation.calls:',
      not: 'ai.moderation.calls:2026-10-17',
    });
  });

  it('stops when the daily budget is used up', async () => {
    order.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `o${i}` })));
    queryRaw.mockResolvedValue([]);

    const result = await sweepPendingOrders({ now: NOW });

    expect(moderateChatOrder).not.toHaveBeenCalled();
    // Each of the four workers stops at its first «budget».
    expect(result.checked).toBeLessThanOrEqual(4);
    expect(result.skipped).toBe(result.checked);
  });

  it('stops after three failures in a row (the API is down)', async () => {
    order.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `o${i}` })));
    moderateChatOrder.mockRejectedValue(new Error('503'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await sweepPendingOrders({ now: NOW });

    expect(result.errors).toBeGreaterThanOrEqual(3);
    expect(result.errors).toBeLessThan(20);
    expect(result.checked).toBe(result.errors);
  });
});

describe('loadAiDecisions and the daily line', () => {
  beforeEach(() => {
    order.findMany.mockReset();
    order.groupBy.mockReset();
  });

  it('lists the last 30 verdicts with what the admin may still do', async () => {
    const at = new Date('2026-10-17T08:00:00Z');
    order.findMany.mockResolvedValue([
      {
        id: 'p',
        status: 'OPEN',
        rawText: 'Нужен   кран\nзавтра',
        description: 'Нужен кран',
        moderatedBy: 'ai',
        moderationDecision: 'PUBLISH',
        moderationReason: 'нужен кран',
        moderatedAt: at,
        categoryId: 'cat',
        desiredEndDate: new Date('2026-10-20T00:00:00Z'),
      },
      {
        id: 'r',
        status: 'CANCELLED',
        rawText: 'Сдаю самосвал',
        description: 'Сдаю самосвал',
        moderatedBy: 'ai',
        moderationDecision: 'REJECT',
        moderationReason: 'предлагает технику',
        moderatedAt: at,
        categoryId: 'cat',
        desiredEndDate: new Date('2026-10-20T00:00:00Z'),
      },
      {
        id: 'erased',
        status: 'CANCELLED',
        rawText: null,
        description: 'Заявка удалена',
        moderatedBy: 'ai',
        moderationDecision: 'REJECT',
        moderationReason: 'спам',
        moderatedAt: at,
        categoryId: 'cat',
        desiredEndDate: new Date('2026-10-20T00:00:00Z'),
      },
      {
        id: 'admin',
        status: 'CANCELLED',
        rawText: 'Нужен погрузчик',
        description: 'Нужен погрузчик',
        moderatedBy: 'admin',
        moderationDecision: 'PUBLISH',
        moderationReason: 'нужен погрузчик',
        moderatedAt: at,
        categoryId: 'cat',
        desiredEndDate: new Date('2026-10-20T00:00:00Z'),
      },
    ]);

    const rows = await loadAiDecisions(NOW);

    const query = order.findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ moderationDecision: { not: null } });
    expect(query.orderBy).toEqual({ moderatedAt: 'desc' });
    expect(query.take).toBe(30);
    expect(rows.map((row) => [row.id, row.canWithdraw, row.canPublish, row.overridden])).toEqual([
      ['p', true, false, false],
      ['r', false, true, false],
      ['erased', false, false, false],
      ['admin', false, false, true],
    ]);
    // No machinery type, or the dates have passed: stays rejected.
    const base = {
      status: 'CANCELLED',
      rawText: 'Нужен самосвал',
      description: 'Нужен самосвал',
      moderatedBy: 'ai',
      moderationDecision: 'REJECT',
      moderationReason: 'не понятно, какая техника нужна',
      moderatedAt: at,
      categoryId: 'cat',
      desiredEndDate: new Date('2026-10-20T00:00:00Z'),
    };
    order.findMany.mockResolvedValue([
      { ...base, id: 'no-type', categoryId: null },
      { ...base, id: 'past', desiredEndDate: new Date('2026-10-16T00:00:00Z') },
    ]);
    expect((await loadAiDecisions(NOW)).map((row) => row.canPublish)).toEqual([false, false]);
    expect(rows[0]?.excerpt).toBe('Нужен кран завтра');
  });

  it('sums up the last day for the owner, or stays silent', async () => {
    order.groupBy.mockResolvedValue([
      { moderationDecision: 'PUBLISH', _count: 4 },
      { moderationDecision: 'REJECT', _count: 9 },
      { moderationDecision: 'UNSURE', _count: 2 },
    ]);
    await expect(aiModerationSummary(NOW)).resolves.toBe(
      '🤖 ИИ за сутки: опубликовал заявок — 4, отклонил — 9.',
    );
    expect(order.groupBy.mock.calls[0]?.[0].where).toEqual({
      moderatedBy: 'ai',
      moderatedAt: { gte: new Date(NOW.getTime() - 24 * HOUR) },
    });

    order.groupBy.mockResolvedValue([]);
    await expect(aiModerationSummary(NOW)).resolves.toBeNull();
  });
});
