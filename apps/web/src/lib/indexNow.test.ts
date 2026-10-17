import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import {
  INDEXNOW_KEY,
  KEY_FILE_PATH,
  createIndexNowPinger,
  indexNowBody,
  indexNowKey,
  type IndexNowBody,
} from './indexNow';

const BASE = 'https://spec-ai-web.vercel.app';

function pinger(
  overrides: Partial<Parameters<typeof createIndexNowPinger>[0]> = {},
  clock = { t: 1_000_000 },
) {
  const sent: IndexNowBody[] = [];
  const send = vi.fn(async (body: IndexNowBody) => {
    sent.push(body);
    return 200;
  });
  const ping = createIndexNowPinger({
    enabled: () => true,
    key: () => 'abcdef0123456789abcdef0123456789',
    base: () => BASE,
    send,
    now: () => clock.t,
    ...overrides,
  });
  return { ping, send, sent, clock };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('indexNowKey', () => {
  it('uses INDEXNOW_KEY when it is a valid key', () => {
    expect(indexNowKey('0123456789abcdef0123456789abcdef')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
  });

  it('falls back to the committed key when unset or malformed', () => {
    expect(indexNowKey(undefined)).toBe(INDEXNOW_KEY);
    expect(indexNowKey('  ')).toBe(INDEXNOW_KEY);
    expect(indexNowKey('short')).toBe(INDEXNOW_KEY);
    expect(indexNowKey('has spaces in it!')).toBe(INDEXNOW_KEY);
  });

  it('is switched off by INDEXNOW_KEY=off', () => {
    expect(indexNowKey('off')).toBeNull();
    expect(indexNowKey(' OFF ')).toBeNull();
  });
});

describe('indexNowBody', () => {
  it('keeps only own-host URLs, once each, and names the key file', () => {
    const body = indexNowBody(
      [
        `${BASE}/orders`,
        `${BASE}/orders`,
        'https://evil.example/orders',
        'not a url',
        `${BASE}/providers/c1`,
      ],
      'key12345',
      BASE,
    );
    expect(body).toEqual({
      host: 'spec-ai-web.vercel.app',
      key: 'key12345',
      keyLocation: `${BASE}${KEY_FILE_PATH}`,
      urlList: [`${BASE}/orders`, `${BASE}/providers/c1`],
    });
  });

  it('is null when nothing of ours is left', () => {
    expect(indexNowBody(['https://other.example/'], 'key12345', BASE)).toBeNull();
  });
});

describe('pingIndexNow (createIndexNowPinger)', () => {
  it('sends at once, then batches and de-duplicates within a minute', async () => {
    const { ping, sent, clock } = pinger();
    expect(await ping([`${BASE}/orders`])).toBe('sent');
    clock.t += 10_000;
    expect(await ping([`${BASE}/orders`, `${BASE}/providers/a`])).toBe('queued');
    clock.t += 10_000;
    expect(await ping([`${BASE}/providers/a`, `${BASE}/equipment/m1`])).toBe('queued');
    expect(sent).toHaveLength(1);
    clock.t += 45_000;
    expect(await ping([`${BASE}/orders`])).toBe('sent');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.urlList.sort()).toEqual(
      [`${BASE}/equipment/m1`, `${BASE}/orders`, `${BASE}/providers/a`].sort(),
    );
  });

  it('never sends more than one request per minute', async () => {
    const { ping, send, clock } = pinger();
    for (let i = 0; i < 30; i += 1) {
      await ping([`${BASE}/orders?page=${i}`]);
      clock.t += 5_000;
    }
    // 150 s of calls: at 0 s, 60 s and 120 s.
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('is off without a key or outside production, and sends nothing', async () => {
    const noKey = pinger({ key: () => null });
    expect(await noKey.ping([`${BASE}/orders`])).toBe('off');
    expect(noKey.send).not.toHaveBeenCalled();
    const preview = pinger({ enabled: () => false });
    expect(await preview.ping([`${BASE}/orders`])).toBe('off');
    expect(preview.send).not.toHaveBeenCalled();
  });

  it('swallows failures: a thrown send, an error status, a broken base', async () => {
    const throwing = pinger({
      send: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await expect(throwing.ping([`${BASE}/orders`])).resolves.toBe('failed');
    const rejected = pinger({ send: vi.fn(async () => 422) });
    await expect(rejected.ping([`${BASE}/orders`])).resolves.toBe('failed');
    const noStatus = pinger({ send: vi.fn(async () => null) });
    await expect(noStatus.ping([`${BASE}/orders`])).resolves.toBe('failed');
    const broken = pinger({ base: () => 'not a url' });
    await expect(broken.ping([`${BASE}/orders`])).resolves.toBe('failed');
  });

  it('keeps the pages of a request that did not get through for the next one', async () => {
    const statuses = [503, 200];
    const { ping, sent, clock } = pinger({
      send: vi.fn(async (body: IndexNowBody) => {
        sent.push(body);
        return statuses.shift() ?? 200;
      }),
    });
    expect(await ping([`${BASE}/providers/a`])).toBe('failed');
    clock.t += 61_000;
    expect(await ping([`${BASE}/orders`])).toBe('sent');
    expect(sent[1]?.urlList.sort()).toEqual([`${BASE}/orders`, `${BASE}/providers/a`]);
  });

  it('the real pinger stays off outside production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { pingIndexNow } = await import('./indexNow');
    expect(await pingIndexNow([`${BASE}/orders`])).toBe('off');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('robots.txt', () => {
  it('points search engines at the sitemap', () => {
    expect(robots().sitemap).toMatch(/^https:\/\/.+\/sitemap\.xml$/);
  });
});
