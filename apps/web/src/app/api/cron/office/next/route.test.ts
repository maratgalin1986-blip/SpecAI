import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const peekScheduledStep = vi.fn();
const relayRequest = vi.fn();
vi.mock('@/lib/office/run', () => ({ peekScheduledStep, relayRequest }));

const { GET } = await import('./route');

function call(auth = 'Bearer cron-test') {
  return GET(
    new NextRequest('http://localhost/api/cron/office/next', { headers: { authorization: auth } }),
  );
}

describe('GET /api/cron/office/next', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-test');
    peekScheduledStep.mockReset();
    relayRequest.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('без секрета — 403, план не читается', async () => {
    expect((await call('Bearer wrong')).status).toBe(403);
    expect((await call('')).status).toBe(403);
    expect(peekScheduledStep).not.toHaveBeenCalled();
  });

  it('пауза или пустой план — только слово', async () => {
    peekScheduledStep.mockResolvedValue({ skipped: 'paused' });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: 'paused' });
    expect(relayRequest).not.toHaveBeenCalled();
  });

  it('шаг: номер, ключ, запрос и зеркала', async () => {
    const step = { agent: 'sites', niche: 'dentist', city: 'Казань' };
    peekScheduledStep.mockResolvedValue({ index: 2, key: '0123456789abcdef', step });
    relayRequest.mockReturnValue({ query: '[out:json];', mirrors: ['https://a.example'] });
    expect(await (await call()).json()).toEqual({
      index: 2,
      key: '0123456789abcdef',
      step,
      query: '[out:json];',
      mirrors: ['https://a.example'],
    });
    expect(relayRequest).toHaveBeenCalledWith(step);
  });
});
