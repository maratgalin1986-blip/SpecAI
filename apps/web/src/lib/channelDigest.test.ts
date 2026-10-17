import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const keys = new Map<string, Date>();
let orders: unknown[] = [];
let orderTotal = 0;
const findMany = vi.fn(async () => orders);
const count = vi.fn(async () => orderTotal);
vi.mock('@specai/database', () => ({
  prisma: {
    order: { findMany, count },
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
const telegramApi = vi.fn(async (_method: string, _body: unknown) => true);
vi.mock('./telegramApi', () => ({ telegramApi }));

const { CHANNEL_JOB, CHANNEL_TITLE, channelDigestText, postChannelDigest } =
  await import('./channelDigest');
const { cronRunKey } = await import('./cronOnce');
const { SITE } = await import('./site');

const BASE = 'https://spec-ai-web.vercel.app';
// 19:00 Moscow on 17 October; the order wants 20 October (Moscow).
const NOW = new Date('2026-10-17T16:00:00Z');
const row = (id: string, category: string | null, city: string | null) => ({
  id,
  desiredStartDate: new Date('2026-10-19T21:00:00Z'),
  category: category ? { name: category } : null,
  location: city === null ? null : { city, latitude: null, longitude: null },
});

beforeEach(() => {
  keys.clear();
  orders = [];
  orderTotal = 0;
  telegramApi.mockClear();
  findMany.mockClear();
  vi.stubEnv('TELEGRAM_CHANNEL_ID', '@iistroyka24_zayavki');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('channelDigestText', () => {
  it('lists kind, city and date with a tagged link, and the provider footer', () => {
    const text = channelDigestText(
      [row('o1', 'Экскаваторы-погрузчики', 'Елабуга'), row('o2', 'Самосвалы', null)],
      BASE,
    );
    expect(text).toContain(`<b>${CHANNEL_TITLE}</b>`);
    expect(text).toContain('Нужен экскаватор-погрузчик · Елабуга · 20 октября');
    expect(text).toContain('Нужен самосвал · 20 октября');
    expect(text).toContain(
      `<a href="${BASE}/orders/o1?utm_source=telegram&amp;utm_medium=channel">Открыть заявку</a>`,
    );
    expect(text).toMatch(
      /Исполнители — выходите на линию в приложении: https:\/\/spec-ai-web\.vercel\.app\/register\?type=provider/,
    );
    // The platform's promise closes every post (owner, 2026-10-17).
    expect(text?.endsWith(`\n\n${SITE.promiseLine}`)).toBe(true);
    expect(SITE.promiseLine).toMatch(/^Бесплатно и без посредников: цену назначает/);
  });

  it('stays well under the Telegram message limit with the promise on a full day', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(
        `cm${'x'.repeat(23)}${i}`,
        'Снегоуборочная техника и коммунальные машины',
        'Петропавловск-Камчатский',
      ),
    );
    const text = channelDigestText(rows, BASE, 40) ?? '';
    expect(text).toContain(SITE.promiseLine);
    expect(text.length).toBeLessThan(4096 - 500);
  });

  it('is null on a day without orders — never filler', () => {
    expect(channelDigestText([], BASE)).toBeNull();
  });

  it('shows at most ten orders and links the board for the rest', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`o${i}`, 'Автокраны', 'Казань'));
    const text = channelDigestText(rows, BASE, 15) ?? '';
    expect(text.match(/Открыть заявку/g)).toHaveLength(10);
    expect(text).toContain('И ещё 5 — <a href=');
  });

  it('carries no address, street, phone or e-mail and escapes HTML', () => {
    const text =
      channelDigestText(
        [
          row('o1', 'Самосвалы', 'Казань, ул. Баумана 15, кв. 3'),
          row('o2', '<b>Краны</b> & Co', 'ул. Мира 12'),
        ],
        BASE,
      ) ?? '';
    expect(text).not.toMatch(/Баумана|Мира|кв\. 3/);
    expect(text).not.toMatch(/\+7|@/);
    expect(text).toContain('&lt;b&gt;Краны&lt;/b&gt; &amp; Co');
  });
});

describe('postChannelDigest', () => {
  it('posts once a Moscow day to the configured channel', async () => {
    orders = [row('o1', 'Автокраны', 'Елабуга')];
    orderTotal = 1;
    expect(await postChannelDigest(NOW)).toEqual({ posted: 1 });
    expect(telegramApi).toHaveBeenCalledTimes(1);
    const [method, body] = telegramApi.mock.calls[0] as [string, Record<string, unknown>];
    expect(method).toBe('sendMessage');
    expect(body).toMatchObject({ chat_id: '@iistroyka24_zayavki', parse_mode: 'HTML' });
    expect(keys.has(cronRunKey(CHANNEL_JOB, NOW))).toBe(true);
    expect(cronRunKey(CHANNEL_JOB, NOW)).toBe('cron:channel-digest:2026-10-17');

    // A retry or a manual run the same evening does not post again.
    expect(await postChannelDigest(new Date(NOW.getTime() + 3_600_000))).toEqual({
      skipped: 'already posted today',
    });
    expect(telegramApi).toHaveBeenCalledTimes(1);
  });

  it('asks only for open orders placed on the platform in the last 24 hours', async () => {
    await postChannelDigest(NOW);
    const args = findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(args[0].where).toEqual({
      status: 'OPEN',
      source: 'SITE',
      createdAt: { gte: new Date(NOW.getTime() - 86_400_000), lte: NOW },
    });
  });

  it('skips the post when there were no orders', async () => {
    expect(await postChannelDigest(NOW)).toEqual({ posted: 0 });
    expect(telegramApi).not.toHaveBeenCalled();
  });

  it('is off without a channel, and never posts from a preview', async () => {
    vi.stubEnv('TELEGRAM_CHANNEL_ID', '');
    expect(await postChannelDigest(NOW)).toEqual({ skipped: 'off' });
    vi.stubEnv('TELEGRAM_CHANNEL_ID', '@iistroyka24_zayavki');
    vi.stubEnv('VERCEL_ENV', 'preview');
    orders = [row('o1', 'Автокраны', 'Елабуга')];
    expect(await postChannelDigest(NOW)).toEqual({ skipped: 'preview' });
    expect(telegramApi).not.toHaveBeenCalled();
    expect(keys.size).toBe(0);
  });

  it('releases the day when Telegram rejects the post, so a retry can send it', async () => {
    orders = [row('o1', 'Автокраны', 'Елабуга')];
    telegramApi.mockResolvedValueOnce(false);
    await expect(postChannelDigest(NOW)).rejects.toThrow();
    expect(keys.has(cronRunKey(CHANNEL_JOB, NOW))).toBe(false);
    expect(await postChannelDigest(NOW)).toEqual({ posted: 1 });
  });
});
