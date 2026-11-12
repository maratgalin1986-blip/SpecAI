import { beforeEach, describe, expect, it, vi } from 'vitest';

type Args = { where?: Record<string, unknown>; select?: unknown; include?: unknown };

const calls: { model: string; method: string; args: Args }[] = [];
function model(name: string, results: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(results).map(([method, result]) => [
      method,
      vi.fn(async (args: Args) => {
        calls.push({ model: name, method, args });
        return typeof result === 'function' ? (result as (a: Args) => unknown)(args) : result;
      }),
    ]),
  );
}

vi.mock('@specai/database', () => ({
  prisma: {
    lead: model('lead', {
      groupBy: [{ source: 'home · yandex / cpc', status: 'NEW', _count: { _all: 2 } }],
      aggregate: { _count: { _all: 1 }, _sum: { amount: 40000 } },
    }),
    order: model('order', {
      groupBy: [{ source: 'SITE', _count: { _all: 3 } }],
      count: (args: Args) => (args.where?.status === 'PENDING_REVIEW' ? 6 : 1),
    }),
    booking: model('booking', { groupBy: [{ status: 'CONFIRMED', _count: { _all: 2 } }] }),
    company: model('company', { count: 1 }),
    equipment: model('equipment', {
      count: (args: Args) => (args.where?.status === 'AVAILABLE' ? 9 : 4),
      groupBy: [{ companyId: 'a' }, { companyId: 'b' }],
    }),
    review: model('review', {
      aggregate: { _count: { _all: 2 }, _sum: { rating: 9 } },
      count: 1,
    }),
    comment: model('comment', { count: 2 }),
    linePresence: model('linePresence', {
      count: (args: Args) => (JSON.stringify(args.where).includes('standingSince') ? 3 : 5),
    }),
  },
}));

const { loadWeeklyData } = await import('./weeklyReportData');
const { reportWeek } = await import('./weeklyReport');

const now = new Date('2026-11-09T05:00:00Z');
const week = reportWeek(now);

describe('loadWeeklyData', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('reads this week and the week before by the Moscow week bounds', async () => {
    const data = await loadWeeklyData(week, now);
    const ranges = calls
      .filter((call) => call.model === 'booking')
      .map((call) => call.args.where?.createdAt);
    expect(ranges).toEqual([
      { gte: week.start, lt: week.end },
      { gte: week.previousStart, lt: week.start },
    ]);
    expect(data.current).toEqual({
      leads: [{ source: 'home · yandex / cpc', status: 'NEW', count: 2 }],
      deals: { count: 1, amount: 40000 },
      orders: [{ source: 'SITE', count: 3 }],
      rejectedImports: 1,
      bookings: [{ status: 'CONFIRMED', count: 2 }],
      providers: 1,
      machines: 4,
      reviews: { count: 2, ratingSum: 9 },
    });
    expect(data.previous).toEqual(data.current);
    expect(data.line).toEqual({ now: 5, house: 9, joined: 3 });
    expect(data.priceUpdates).toBe(2);
    expect(data.waiting).toEqual({ orders: 6, reviewTexts: 3 });
  });

  it('asks the database for counts only: no names, phones or texts of people', async () => {
    await loadWeeklyData(week, now);
    expect(calls.length).toBeGreaterThan(10);
    for (const call of calls) {
      expect(['count', 'groupBy', 'aggregate']).toContain(call.method);
      expect(call.args.select).toBeUndefined();
      expect(call.args.include).toBeUndefined();
    }
  });

  it('keeps bot drafts and the house company out of the numbers', async () => {
    await loadWeeklyData(week, now);
    const where = (name: string, method: string) =>
      JSON.stringify(calls.find((c) => c.model === name && c.method === method)!.args.where);
    expect(where('lead', 'groupBy')).toContain('"NOT":{"phone":""}');
    expect(where('company', 'count')).toContain('specplast16-house');
    expect(where('linePresence', 'count')).toContain('specplast16-house');
    // A customer's own cancellation (no moderation decision) is still a request.
    expect(where('order', 'groupBy')).toContain('"moderationDecision":null');
  });
});
