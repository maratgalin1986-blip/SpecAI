import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EMPTY_WEEK } from '@/lib/weeklyReport';

// The real once-a-week guard (lib/cronOnce.ts) over an in-memory AdminFeedRead.
const keys = new Map<string, Date>();
const notifyTelegram = vi.fn();
const loadWeeklyData = vi.fn();
const sendWeeklyNewsletter = vi.fn();
const sendWeeklyPriceAsk = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: {
    adminFeedRead: {
      create: vi.fn(async ({ data }: { data: { key: string } }) => {
        if (keys.has(data.key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        keys.set(data.key, new Date());
        return data;
      }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const readAt = keys.get(where.key);
        return readAt ? { id: where.key, key: where.key, readAt } : null;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        keys.delete(where.key);
        return { count: 1 };
      }),
    },
  },
}));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/weeklyReportData', () => ({ loadWeeklyData }));
vi.mock('@/lib/indexNow', () => ({ submitToIndexNow: vi.fn() }));
vi.mock('@/app/sitemap', () => ({ default: vi.fn(async () => []) }));
vi.mock('@/lib/newsletterData', () => ({ sendWeeklyNewsletter }));
vi.mock('@/lib/aktualnoData', () => ({ sendWeeklyPriceAsk }));

const { GET } = await import('./route');

function call() {
  return GET(
    new NextRequest('http://localhost/api/cron/weekly', {
      headers: { authorization: 'Bearer cron-secret' },
    }),
  );
}

// Monday 9 November 2026, 08:00 Moscow: the report is about 2–8 November.
const MONDAY = new Date('2026-11-09T05:00:00Z');

describe('GET /api/cron/weekly', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MONDAY);
    process.env.CRON_SECRET = 'cron-secret';
    keys.clear();
    notifyTelegram.mockReset();
    notifyTelegram.mockResolvedValue(true);
    loadWeeklyData.mockReset();
    loadWeeklyData.mockResolvedValue({
      current: { ...EMPTY_WEEK, orders: [{ source: 'SITE', count: 3 }] },
      previous: EMPTY_WEEK,
      line: { now: 2, house: 9, joined: 1 },
      priceUpdates: 0,
      waiting: { orders: 0, reviewTexts: 0 },
    });
    sendWeeklyNewsletter.mockReset();
    sendWeeklyNewsletter.mockResolvedValue({ sent: 0, skipped: 0, failed: 0 });
    sendWeeklyPriceAsk.mockReset();
    sendWeeklyPriceAsk.mockResolvedValue({ sent: 0, skipped: 0, failed: 0 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the report about the last full Moscow week', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, sent: true, week: '2026-11-02' });
    const [week] = loadWeeklyData.mock.calls[0]!;
    expect(week.start.toISOString()).toBe('2026-11-01T21:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
    const text = notifyTelegram.mock.calls[0]![0] as string;
    expect(text).toContain('неделя 2–8 ноября');
    expect(text).toContain('Заявки: 3');
  });

  it('never sends a second report for the same week, on Monday or days later', async () => {
    await call();
    // Vercel Cron and the GitHub schedule both came, then the late backstop.
    vi.setSystemTime(new Date('2026-11-09T09:23:00Z'));
    const again = await (await call()).json();
    expect(again).toMatchObject({ ok: true, skipped: 'already sent for this week' });
    vi.setSystemTime(new Date('2026-11-10T05:23:00Z'));
    expect((await (await call()).json()).skipped).toBe('already sent for this week');
    expect(notifyTelegram).toHaveBeenCalledTimes(1);

    // The next Monday is a new week.
    vi.setSystemTime(new Date('2026-11-16T05:00:00Z'));
    expect(await (await call()).json()).toMatchObject({ sent: true, week: '2026-11-09' });
    expect(notifyTelegram).toHaveBeenCalledTimes(2);
  });

  it('a late run on Tuesday still reports the week that ended on Sunday', async () => {
    vi.setSystemTime(new Date('2026-11-10T05:23:00Z'));
    expect(await (await call()).json()).toMatchObject({ sent: true, week: '2026-11-02' });
  });

  it('waits for the morning: nothing goes out in the night to Monday', async () => {
    // Monday 02:00 Moscow.
    vi.setSystemTime(new Date('2026-11-08T23:00:00Z'));
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: 'too early' });
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(loadWeeklyData).not.toHaveBeenCalled();
  });

  it('gives the week back when Telegram did not accept the report', async () => {
    notifyTelegram.mockResolvedValue(false);
    const failed = await call();
    expect(failed.status).toBe(500);
    expect((await failed.json()).ok).toBe(false);

    notifyTelegram.mockResolvedValue(true);
    vi.setSystemTime(new Date('2026-11-09T07:23:00Z'));
    expect(await (await call()).json()).toMatchObject({ sent: true });
    expect(notifyTelegram).toHaveBeenCalledTimes(2);
  });

  it('gives the week back when the database could not be read', async () => {
    loadWeeklyData.mockRejectedValueOnce(new Error('db down'));
    expect((await call()).status).toBe(500);
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(await (await call()).json()).toMatchObject({ sent: true });
  });

  it('runs the weekly report even when the newsletter throws', async () => {
    sendWeeklyNewsletter.mockRejectedValue(new Error('resend down'));
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, sent: true });
    expect(body.newsletter.error).toContain('resend down');
  });

  it('sends the newsletter after the report, with a deadline', async () => {
    const order: string[] = [];
    notifyTelegram.mockImplementation(async () => {
      order.push('report');
      return true;
    });
    sendWeeklyNewsletter.mockImplementation(async (options: { deadline: number }) => {
      order.push('newsletter');
      expect(options.deadline).toBeGreaterThan(Date.now());
      return { sent: 2, skipped: 0, failed: 0 };
    });
    const body = await (await call()).json();
    expect(order).toEqual(['report', 'newsletter']);
    expect(body.newsletter).toEqual({ sent: 2, skipped: 0, failed: 0 });
  });

  it('still sends the newsletter when the report was already sent or failed', async () => {
    await call();
    await call();
    notifyTelegram.mockResolvedValue(false);
    vi.setSystemTime(new Date('2026-11-16T05:00:00Z'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(sendWeeklyNewsletter).toHaveBeenCalledTimes(3);
  });

  it('asks providers to update prices last, within its own budget, even when the rest failed', async () => {
    const order: string[] = [];
    notifyTelegram.mockImplementation(async () => {
      order.push('report');
      return true;
    });
    sendWeeklyNewsletter.mockImplementation(async (options: { deadline: number }) => {
      order.push('newsletter');
      return { sent: 0, skipped: 0, failed: 0, deadline: options.deadline };
    });
    sendWeeklyPriceAsk.mockImplementation(async (options: { deadline: number }) => {
      order.push('price-ask');
      return { sent: 3, skipped: 1, failed: 0, deadline: options.deadline };
    });
    const body = await (await call()).json();
    expect(order).toEqual(['report', 'newsletter', 'price-ask']);
    expect(body.priceAsk).toMatchObject({ sent: 3 });
    // The ask may run after the newsletter's budget, but still inside maxDuration (60 s).
    expect(body.priceAsk.deadline).toBeGreaterThan(body.newsletter.deadline);
    expect(body.priceAsk.deadline - Date.now()).toBeLessThan(55_000);

    sendWeeklyNewsletter.mockRejectedValue(new Error('resend down'));
    notifyTelegram.mockResolvedValue(false);
    vi.setSystemTime(new Date('2026-11-16T05:00:00Z'));
    const failed = await call();
    expect(failed.status).toBe(500);
    expect(sendWeeklyPriceAsk).toHaveBeenCalledTimes(2);
  });

  it('a failing price ask does not cost the report', async () => {
    sendWeeklyPriceAsk.mockRejectedValue(new Error('telegram down'));
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).priceAsk.error).toContain('telegram down');
  });

  it('refuses a call without the cron secret', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cron/weekly'));
    expect(response.status).toBe(403);
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(sendWeeklyNewsletter).not.toHaveBeenCalled();
    expect(sendWeeklyPriceAsk).not.toHaveBeenCalled();
  });
});
