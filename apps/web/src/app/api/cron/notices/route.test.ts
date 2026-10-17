import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const flushDeferredOrderNotices = vi.fn();
vi.mock('@/lib/deferredOrderNotices', () => ({ flushDeferredOrderNotices }));

const { GET } = await import('./route');

function call(ip: string) {
  return GET(
    new NextRequest('http://localhost/api/cron/notices', { headers: { 'x-forwarded-for': ip } }),
  );
}

describe('GET /api/cron/notices', () => {
  beforeEach(() => {
    flushDeferredOrderNotices.mockReset();
    flushDeferredOrderNotices.mockResolvedValue({ due: 2, sent: 1, skipped: 1 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('works on production only', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await call('10.0.0.1')).status).toBe(403);
    vi.stubEnv('VERCEL_ENV', '');
    expect((await call('10.0.0.1')).status).toBe(403);
    expect(flushDeferredOrderNotices).not.toHaveBeenCalled();
  });

  it('answers counts only', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    flushDeferredOrderNotices.mockResolvedValue({
      due: 2,
      sent: 1,
      skipped: 1,
      // Anything else a future version might return never leaks out.
      orderIds: ['o1'],
    });
    const response = await call('10.0.0.2');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, due: 2, sent: 1, skipped: 1 });
  });

  it('is rate-limited by IP', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    for (let i = 0; i < 5; i += 1) expect((await call('10.0.0.3')).status).toBe(200);
    expect((await call('10.0.0.3')).status).toBe(429);
    expect((await call('10.0.0.4')).status).toBe(200);
    expect(flushDeferredOrderNotices).toHaveBeenCalledTimes(6);
  });

  it('answers 500 without details when the flush fails', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    flushDeferredOrderNotices.mockRejectedValue(new Error('db at 10.1.2.3 down'));
    const response = await call('10.0.0.5');
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.1.2.3');
  });
});
