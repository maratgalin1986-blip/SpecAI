import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SnapshotReader } from '@specai/database/src/backup';

const PRIVATE = 'Иван Петров +7 900 000-00-00';
const reader: SnapshotReader = {
  tables: async () => ['User'],
  count: async () => 2,
  async *rows() {
    yield [`{"id": "u1", "name": "${PRIVATE}"}`, '{"id": "u2", "name": null}'];
  },
};
const withSnapshot = vi.fn();
vi.mock('@specai/database', () => ({ prisma: {} }));
vi.mock('@specai/database/src/backup', async (original) => ({
  ...(await original<typeof import('@specai/database/src/backup')>()),
  withSnapshot,
}));
const onceADay = vi.fn();
vi.mock('@/lib/cronOnce', () => ({ onceADay }));
const notifyTelegram = vi.fn();
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
const sendOwnerDocument = vi.fn();
vi.mock('@/lib/backupSend', async (original) => ({
  ...(await original<typeof import('@/lib/backupSend')>()),
  sendOwnerDocument,
}));

const { GET, maxDuration } = await import('./route');

function call(ip: string, auth = 'Bearer cron-test') {
  return GET(
    new NextRequest('http://localhost/api/cron/backup', {
      headers: { 'x-forwarded-for': ip, authorization: auth },
    }),
  );
}

describe('GET /api/cron/backup', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-test');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    withSnapshot.mockReset();
    withSnapshot.mockImplementation((_db, task: (r: SnapshotReader) => unknown) => task(reader));
    onceADay.mockReset();
    onceADay.mockImplementation((_job: string, task: () => unknown) => task());
    notifyTelegram.mockReset();
    notifyTelegram.mockResolvedValue(true);
    sendOwnerDocument.mockReset();
    sendOwnerDocument.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fits the plan’s function time', () => {
    expect(maxDuration).toBeLessThanOrEqual(60);
  });

  it('works on production only and requires CRON_SECRET', async () => {
    expect((await call('10.1.0.1', 'Bearer wrong')).status).toBe(403);
    expect((await call('10.1.0.1', '')).status).toBe(403);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await call('10.1.0.1')).status).toBe(403);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('10.1.0.1', 'Bearer ')).status).toBe(403);
    expect(onceADay).not.toHaveBeenCalled();
    expect(withSnapshot).not.toHaveBeenCalled();
    expect(sendOwnerDocument).not.toHaveBeenCalled();
  });

  it('sends the encrypted copy and answers numbers only', async () => {
    const response = await call('10.1.0.2');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['bytes', 'ok', 'parts', 'rows', 'tables']);
    expect(body).toMatchObject({ ok: true, tables: 1, rows: 2, parts: 1 });
    expect(onceADay).toHaveBeenCalledWith('backup', expect.any(Function));
    expect(sendOwnerDocument).toHaveBeenCalledTimes(1);
    const [file, name, caption] = sendOwnerDocument.mock.calls[0]!;
    expect(name).toMatch(/^iistroyka24-\d{4}-\d\d-\d\d-\d{4}-1of1\.bkp$/);
    expect(caption).toContain('Проверка восстановления пройдена');
    expect((file as Buffer).toString('utf8') + caption + JSON.stringify(body)).not.toContain(
      'Иван',
    );
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it('sends no second copy on the same day', async () => {
    onceADay.mockResolvedValue(null);
    const response = await call('10.1.0.3');
    expect(await response.json()).toEqual({ ok: true, skipped: 'already sent today' });
    expect(sendOwnerDocument).not.toHaveBeenCalled();
  });

  it('answers 500 with a word and tells the owner when the copy fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    withSnapshot.mockRejectedValue(new Error(`connection lost near ${PRIVATE}`));
    let response = await call('10.1.0.4');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, failed: 'build' });
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
    expect(notifyTelegram.mock.calls[0]![0]).not.toContain('Иван');

    // The day itself could not be claimed.
    notifyTelegram.mockClear();
    onceADay.mockRejectedValue(new Error('database is down'));
    response = await call('10.1.0.4');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, failed: 'build' });
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('Иван');
    log.mockRestore();
  });

  it('builds nothing without the owner’s private chat', async () => {
    vi.stubEnv('TELEGRAM_CHAT_ID', '-100123');
    const response = await call('10.1.0.5');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, failed: 'no-chat' });
    expect(withSnapshot).not.toHaveBeenCalled();
  });

  it('is rate-limited by IP', async () => {
    onceADay.mockResolvedValue(null);
    for (let index = 0; index < 3; index += 1) expect((await call('10.1.0.6')).status).toBe(200);
    expect((await call('10.1.0.6')).status).toBe(429);
  });
});
