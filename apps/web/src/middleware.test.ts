import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetDomainMapCache } from '@/lib/office/domainMap';

const authMiddleware = vi.fn(async () => undefined);
vi.mock('next-auth/middleware', () => ({ default: authMiddleware }));

const { default: middleware } = await import('./middleware');

const event = {} as never;
const MAIN_HOST = 'xn--24-6kc5aagh4arjl.xn--p1ai';

describe('middleware: свой домен клиента (S7)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetDomainMapCache();
    authMiddleware.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({
        sites: [
          { host: 'ulybka-kazan.ru', slug: 'ulybka-kazan' },
          { host: 'www.ulybka-kazan.ru', slug: 'ulybka-kazan' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('любая страница домена клиента — его сайт, хост уходит заголовком', async () => {
    const res = await middleware(new NextRequest('https://www.Ulybka-Kazan.ru/dashboard'), event);
    expect(res?.headers.get('x-middleware-rewrite')).toBe(
      'https://www.ulybka-kazan.ru/s/ulybka-kazan',
    );
    expect(res?.headers.get('x-middleware-request-x-client-domain')).toBe('www.ulybka-kazan.ru');
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://www.ulybka-kazan.ru/api/office/domains',
    );
    // /dashboard на домене клиента — тоже его сайт, без входа на площадку.
    expect(authMiddleware).not.toHaveBeenCalled();
  });

  it('карта берётся из памяти, а не на каждый запрос', async () => {
    await middleware(new NextRequest('https://ulybka-kazan.ru/'), event);
    await middleware(new NextRequest('https://ulybka-kazan.ru/uslugi'), event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('хост площадки — без карты и без подмены; чужой x-client-domain отбрасывается', async () => {
    const res = await middleware(
      new NextRequest(`https://${MAIN_HOST}/s/ulybka-kazan`, {
        headers: { 'user-agent': 'test', 'x-client-domain': 'ulybka-kazan.ru' },
      }),
      event,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res?.headers.get('x-middleware-override-headers')).toBe('user-agent');
    expect(res?.headers.get('x-middleware-request-x-client-domain')).toBeNull();
  });

  it('незнакомый домен и недоступная карта — площадка как раньше', async () => {
    const res = await middleware(new NextRequest('https://other.ru/?ref=ABC123'), event);
    expect(res?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res?.headers.get('x-middleware-next')).toBe('1');

    resetDomainMapCache();
    fetchMock.mockRejectedValue(new Error('сеть'));
    const down = await middleware(new NextRequest('https://ulybka-kazan.ru/'), event);
    expect(down?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(down?.headers.get('x-middleware-next')).toBe('1');
  });
});
