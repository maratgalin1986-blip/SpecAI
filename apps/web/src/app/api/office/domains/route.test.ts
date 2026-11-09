import { beforeEach, describe, expect, it, vi } from 'vitest';

const prospectFindMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { prospect: { findMany: prospectFindMany } } }));

const { GET } = await import('./route');

async function get() {
  const response = await GET();
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe('GET /api/office/domains: карта доменов клиентов для middleware', () => {
  beforeEach(() => {
    prospectFindMany.mockReset();
  });

  it('только опубликованные сайты с доменом, с лимитом и порядком', async () => {
    prospectFindMany.mockResolvedValue([]);
    await get();
    expect(prospectFindMany).toHaveBeenCalledWith({
      where: { kind: 'site', status: 'PUBLISHED', domain: { not: null } },
      select: { slug: true, domain: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  });

  it('оба хоста, без имён, телефонов и id; кэш CDN на 5 минут', async () => {
    // Даже если бы база вернула лишние поля, наружу уходят только host и slug.
    prospectFindMany.mockResolvedValue([
      {
        id: 'prospect-1',
        name: 'Стоматология «Улыбка»',
        phone: '+79000000000',
        slug: 'ulybka-kazan',
        domain: 'ulybka-kazan.ru',
      },
    ]);
    const { status, cache, body } = await get();
    expect(status).toBe(200);
    expect(cache).toContain('s-maxage=300');
    expect(body).toEqual({
      sites: [
        { host: 'ulybka-kazan.ru', slug: 'ulybka-kazan' },
        { host: 'www.ulybka-kazan.ru', slug: 'ulybka-kazan' },
      ],
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('prospect-1');
    expect(text).not.toContain('Улыбка');
    expect(text).not.toContain('79000000000');
  });

  it('база недоступна — 503 без кэша, текст по-русски', async () => {
    prospectFindMany.mockRejectedValue(new Error('connection refused'));
    const { status, cache, body } = await get();
    expect(status).toBe(503);
    expect(cache).toBe('no-store');
    expect(body).toEqual({ error: 'Список адресов сейчас недоступен, попробуйте позже' });
  });
});
