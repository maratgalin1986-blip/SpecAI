import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendEmailInput, SendEmailResult } from './email';

const userFindMany = vi.fn();
const userUpdateMany = vi.fn();
const orderFindMany = vi.fn();
const orderGroupBy = vi.fn();
const loadProviderForMatch = vi.fn();
vi.mock('@specai/database', () => ({
  HOUSE_COMPANY_ID: 'house',
  prisma: {
    user: { findMany: userFindMany, updateMany: userUpdateMany, count: vi.fn() },
    order: {
      count: vi.fn(async () => 5),
      findMany: orderFindMany,
      groupBy: orderGroupBy,
    },
    company: { count: vi.fn(async () => 4), findMany: vi.fn(async () => []) },
    linePresence: { findMany: vi.fn(async () => []) },
    equipmentCategory: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('./providerFeedData', () => ({ loadProviderForMatch }));

const { sendWeeklyNewsletter, NEWS_MAX_FAILURES, NEWS_PAGE, NEWS_SEND_TIMEOUT_MS } =
  await import('./newsletterData');
type Send = (input: SendEmailInput) => Promise<SendEmailResult>;

const now = new Date('2026-10-19T05:00:00Z');
const originalEnv = { ...process.env };

function subscriber(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Анна',
    email: `${id}@example.com`,
    role: 'CUSTOMER',
    companyId: null,
    lastNewsAt: null,
    company: null,
    ...extra,
  };
}

const ok = { skipped: false as const, ok: true as const, id: 'm1' };
const fail = { skipped: false as const, ok: false as const, error: 'boom' };

function run(send: Send) {
  return sendWeeklyNewsletter({
    now,
    deadline: Date.now() + 60_000,
    send,
    sleep: async () => undefined,
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'ИИСтройка24 <news@example.com>';
  process.env.NEXTAUTH_SECRET = 'test-secret';
  for (const mock of [
    userFindMany,
    userUpdateMany,
    orderFindMany,
    orderGroupBy,
    loadProviderForMatch,
  ]) {
    mock.mockReset();
  }
  userUpdateMany.mockResolvedValue({ count: 1 });
  orderFindMany.mockResolvedValue([]);
  orderGroupBy.mockResolvedValue([]);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('weekly newsletter', () => {
  it('sends nothing and reads nobody without RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const send = vi.fn<Send>();
    const result = await run(send);
    expect(result.stopped).toBe('not-configured');
    expect(send).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
    // Logged once per process, not per run.
    const logged = () =>
      info.mock.calls.filter(([line]) => String(line).includes('[newsletter]')).length;
    expect(logged()).toBe(1);
    await run(send);
    expect(logged()).toBe(1);
  });

  it('asks only for consenting, not unsubscribed, real addresses', async () => {
    userFindMany.mockResolvedValue([]);
    await run(vi.fn<Send>());
    const where = userFindMany.mock.calls[0]?.[0].where;
    expect(where.newsConsentAt).toEqual({ not: null });
    expect(where.newsUnsubscribedAt).toBeNull();
    expect(where.email.not).toEqual({ endsWith: '.invalid' });
  });

  it('claims the week before sending and sends with the unsubscribe headers', async () => {
    userFindMany.mockResolvedValue([subscriber('u1')]);
    const send = vi.fn<Send>(async () => ok);
    const result = await run(send);
    expect(result.sent).toBe(1);
    const claim = userUpdateMany.mock.calls[0]?.[0];
    expect(claim.where.id).toBe('u1');
    expect(claim.where.newsConsentAt).toEqual({ not: null });
    expect(claim.data).toEqual({ lastNewsAt: now });
    const letter = send.mock.calls[0]?.[0] as SendEmailInput;
    expect(letter.to).toBe('u1@example.com');
    expect(letter.headers?.['List-Unsubscribe']).toMatch(
      /^<https?:\/\/.+\/api\/unsubscribe\?t=.+>$/,
    );
    expect(letter.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(letter.html).toContain('/unsubscribe?t=');
  });

  it('does not send twice: a user someone else already claimed is skipped', async () => {
    userFindMany.mockResolvedValue([subscriber('u1')]);
    userUpdateMany.mockResolvedValue({ count: 0 });
    const send = vi.fn<Send>(async () => ok);
    const result = await run(send);
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
  });

  it('gives the week back when a send fails, and stops after repeated errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    userFindMany.mockResolvedValue(
      Array.from({ length: NEWS_MAX_FAILURES + 2 }, (_, i) => subscriber(`u${i}`)),
    );
    const send = vi.fn<Send>(async () => fail);
    const result = await run(send);
    expect(result.stopped).toBe('errors');
    expect(send).toHaveBeenCalledTimes(NEWS_MAX_FAILURES);
    const releases = userUpdateMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.where.lastNewsAt === now);
    expect(releases).toHaveLength(NEWS_MAX_FAILURES);
    expect(releases[0].data).toEqual({ lastNewsAt: null });
  });

  it('skips a user when there is nothing true to say', async () => {
    const database = await import('@specai/database');
    vi.mocked(database.prisma.company.count).mockResolvedValueOnce(0);
    userFindMany.mockResolvedValue([subscriber('u1')]);
    const send = vi.fn<Send>(async () => ok);
    const result = await run(send);
    expect(send).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('starts no letter after the deadline', async () => {
    userFindMany.mockResolvedValue([subscriber('u1')]);
    const send = vi.fn<Send>(async () => ok);
    const result = await sendWeeklyNewsletter({ now, deadline: Date.now() - 1, send });
    expect(result.stopped).toBe('deadline');
    expect(send).not.toHaveBeenCalled();
  });

  it('tells a provider how many orders of the week still wait for its price', async () => {
    userFindMany.mockResolvedValue([
      subscriber('p1', { role: 'PROVIDER_ADMIN', companyId: 'c1', company: { isProvider: true } }),
    ]);
    loadProviderForMatch.mockResolvedValue({
      categoryIds: ['cat1'],
      baseLat: 55.74,
      baseLon: 52.4,
      radiusKm: 100,
      baseAddress: 'Набережные Челны',
      isHouse: false,
    });
    orderFindMany.mockResolvedValue([
      { categoryId: 'cat1', location: { latitude: 55.75, longitude: 52.41 } },
    ]);
    const send = vi.fn<Send>(async () => ok);
    await run(send);
    // The cabinet's rule: not its own orders, not priced by it yet, this week only.
    const where = orderFindMany.mock.calls[0]?.[0].where;
    expect(where.status).toBe('OPEN');
    expect(where.bids).toEqual({ none: { equipment: { companyId: 'c1' } } });
    expect(where.createdAt.gte).toEqual(new Date(now.getTime() - 7 * 86_400_000));
    const letter = send.mock.calls[0]?.[0] as SendEmailInput;
    expect(letter.text).toContain('1 заявка');
    expect(letter.text).toContain('/provider#feed');
    // Nothing about other people: no names, phones or prices.
    expect(letter.text).not.toMatch(/\+7|₽/);
  });

  it('goes on with the others when one subscriber fails in the database', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    userFindMany.mockResolvedValue([
      subscriber('p1', { role: 'PROVIDER_ADMIN', companyId: 'c1', company: { isProvider: true } }),
      subscriber('u2'),
    ]);
    loadProviderForMatch.mockRejectedValue(new Error('pool timeout'));
    const send = vi.fn<Send>(async () => ok);
    const result = await run(send);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect((send.mock.calls[0]?.[0] as SendEmailInput).to).toBe('u2@example.com');
  });

  it('does not read the same left-alone subscribers again on the next page', async () => {
    const database = await import('@specai/database');
    vi.mocked(database.prisma.company.count).mockResolvedValueOnce(0);
    const page = Array.from({ length: NEWS_PAGE }, (_, i) => subscriber(`u${i}`));
    userFindMany.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    await run(vi.fn<Send>(async () => ok));
    const second = userFindMany.mock.calls[1]?.[0].where;
    expect(second.id.notIn).toHaveLength(NEWS_PAGE);
  });

  it('gives a customer the numbers near the place of the last order', async () => {
    const database = await import('@specai/database');
    vi.mocked(database.prisma.company.findMany).mockResolvedValueOnce([
      { baseLat: 55.74, baseLon: 52.4 },
      { baseLat: 55.75, baseLon: 52.42 },
      { baseLat: 59.93, baseLon: 30.31 },
    ] as never);
    userFindMany.mockResolvedValue([subscriber('u1')]);
    const last = new Date('2026-10-10T10:00:00Z');
    orderGroupBy.mockResolvedValue([{ customerId: 'u1', _max: { createdAt: last } }]);
    orderFindMany.mockResolvedValue([
      { customerId: 'u1', location: { latitude: 55.74, longitude: 52.41 } },
    ]);
    const send = vi.fn<Send>(async () => ok);
    await run(send);
    expect(orderFindMany.mock.calls[0]?.[0].where.OR).toEqual([
      { customerId: 'u1', createdAt: last },
    ]);
    const letter = send.mock.calls[0]?.[0] as SendEmailInput;
    expect(letter.text).toContain('Рядом с местом вашей последней заявки');
    expect(letter.text).toContain('2 исполнителя');
  });

  it('a send that never answers counts as failed and keeps the week claimed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      userFindMany.mockResolvedValue([subscriber('u1')]);
      const send = vi.fn<Send>(() => new Promise<SendEmailResult>(() => undefined));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const running = run(send);
      await vi.advanceTimersByTimeAsync(NEWS_SEND_TIMEOUT_MS + 10);
      const result = await running;
      expect(result.failed).toBe(1);
      // Not given back: the letter may still arrive, and a second one must not.
      const releases = userUpdateMany.mock.calls.filter(([args]) => args.where.lastNewsAt === now);
      expect(releases).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
