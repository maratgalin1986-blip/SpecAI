import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const onceADay = vi.fn();
const sendWeeklyNewsletter = vi.fn();
vi.mock('@specai/database', () => ({ prisma: {} }));
vi.mock('@/lib/cronOnce', () => ({ onceADay }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn() }));
vi.mock('@/lib/indexNow', () => ({ submitToIndexNow: vi.fn() }));
vi.mock('@/app/sitemap', () => ({ default: vi.fn(async () => []) }));
vi.mock('@/lib/newsletterData', () => ({ sendWeeklyNewsletter }));

const { GET } = await import('./route');

function call() {
  return GET(
    new NextRequest('http://localhost/api/cron/weekly', {
      headers: { authorization: 'Bearer cron-secret' },
    }),
  );
}

describe('GET /api/cron/weekly', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    onceADay.mockReset();
    sendWeeklyNewsletter.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('runs the weekly report even when the newsletter throws', async () => {
    onceADay.mockResolvedValue({ sent: true, indexNow: null });
    sendWeeklyNewsletter.mockRejectedValue(new Error('resend down'));
    const response = await call();
    expect(response.status).toBe(200);
    expect(onceADay).toHaveBeenCalledWith('weekly', expect.any(Function));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, sent: true });
    expect(body.newsletter.error).toContain('resend down');
  });

  it('sends the newsletter after the report, with a deadline', async () => {
    const order: string[] = [];
    onceADay.mockImplementation(async () => {
      order.push('report');
      return { sent: true };
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

  it('still sends the newsletter when the report already ran today or failed', async () => {
    onceADay.mockResolvedValue(null);
    sendWeeklyNewsletter.mockResolvedValue({ sent: 0, skipped: 0, failed: 0 });
    expect((await (await call()).json()).skipped).toBe('already sent today');

    onceADay.mockRejectedValue(new Error('db down'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(sendWeeklyNewsletter).toHaveBeenCalledTimes(2);
  });

  it('refuses a call without the cron secret', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cron/weekly'));
    expect(response.status).toBe(403);
    expect(sendWeeklyNewsletter).not.toHaveBeenCalled();
  });
});
