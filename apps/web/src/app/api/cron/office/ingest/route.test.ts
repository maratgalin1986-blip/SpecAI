import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ingestScheduledStep = vi.fn();
vi.mock('@/lib/office/run', () => ({ ingestScheduledStep }));

const { POST } = await import('./route');

const KEY = '0123456789abcdef';

function call(
  body: string,
  opts: { query?: string; auth?: string; headers?: Record<string, string> } = {},
) {
  return POST(
    new NextRequest(
      `http://localhost/api/cron/office/ingest${opts.query ?? `?index=3&key=${KEY}`}`,
      {
        method: 'POST',
        body,
        headers: {
          authorization: opts.auth ?? 'Bearer cron-test',
          'content-type': 'application/json',
          ...opts.headers,
        },
      },
    ),
  );
}

describe('POST /api/cron/office/ingest', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-test');
    ingestScheduledStep.mockReset();
    ingestScheduledStep.mockResolvedValue({
      status: 'done',
      result: { runId: 'run-secret-id', found: 5, created: 2, skipped: 3, error: null },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('без секрета — 403, шаг не трогается', async () => {
    expect((await call('{"elements":[]}', { auth: 'Bearer wrong' })).status).toBe(403);
    expect((await call('{"elements":[]}', { auth: '' })).status).toBe(403);
    expect(ingestScheduledStep).not.toHaveBeenCalled();
  });

  it('ответ Overpass → только числа и текст ошибки, без идентификаторов', async () => {
    const response = await call('{"elements":[{"type":"node","id":1}]}');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ found: 5, created: 2, skipped: 3, error: null });
    expect(ingestScheduledStep).toHaveBeenCalledWith({
      index: 3,
      key: KEY,
      overpass: { elements: [{ type: 'node', id: 1 }] },
    });
  });

  it('ошибка раннера уходит в журнал как отказ источника', async () => {
    await call('{"error":"Overpass не ответил с раннера GitHub"}');
    expect(ingestScheduledStep).toHaveBeenCalledWith({
      index: 3,
      key: KEY,
      error: 'Overpass не ответил с раннера GitHub',
    });
  });

  it('устаревший шаг — 409', async () => {
    ingestScheduledStep.mockResolvedValue({ status: 'stale' });
    const response = await call('{"elements":[]}');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'stale' });
  });

  it('больше 4 МБ — 413: и по заголовку, и по прочитанному телу', async () => {
    const byHeader = await call('{"elements":[]}', {
      headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
    });
    expect(byHeader.status).toBe(413);
    const big = `{"elements":[],"pad":"${'x'.repeat(4 * 1024 * 1024)}"}`;
    expect((await call(big, { headers: { 'content-length': '10' } })).status).toBe(413);
    expect(ingestScheduledStep).not.toHaveBeenCalled();
  });

  it('не JSON, не объект, плохие index или key — 400', async () => {
    expect((await call('<html>')).status).toBe(400);
    expect((await call('[1,2]')).status).toBe(400);
    expect((await call('{"elements":[]}', { query: '?index=x&key=' + KEY })).status).toBe(400);
    expect((await call('{"elements":[]}', { query: '?index=1&key=zz' })).status).toBe(400);
    expect(ingestScheduledStep).not.toHaveBeenCalled();
  });
});
