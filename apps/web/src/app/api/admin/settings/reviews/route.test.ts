import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn((args: unknown) => ({ op: 'upsert', args }));
const deleteMany = vi.fn((args: unknown) => ({ op: 'deleteMany', args }));
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('@specai/database', () => ({
  prisma: {
    appSetting: { findMany, upsert, deleteMany },
    $transaction: transaction,
  },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET, PUT } = await import('./route');

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api/admin/settings/reviews', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe('/api/admin/settings/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockReturnValue(true);
    findMany.mockResolvedValue([]);
  });

  it('refuses without the admin session and touches nothing', async () => {
    isAdminRequest.mockReturnValue(false);
    expect((await GET()).status).toBe(401);
    const write = await put({ twoGis: 'https://2gis.ru/kazan/firm/1' });
    expect(write.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores a 2ГИС link, keeps the Яндекс one that was not sent', async () => {
    findMany.mockResolvedValue([
      { key: 'reviews.yandex', value: 'https://yandex.ru/maps/org/1/', updatedAt: null },
    ]);
    const response = await put({ twoGis: ' https://2gis.ru/kazan/firm/70000001 ' });
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'reviews.2gis' },
        update: { value: 'https://2gis.ru/kazan/firm/70000001' },
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'reviews.yandex' },
        update: { value: 'https://yandex.ru/maps/org/1/' },
      }),
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a link to another site with a reason', async () => {
    const response = await put({ yandex: 'https://evil.example/maps' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Яндекс Карты');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('an empty field clears the link', async () => {
    findMany.mockResolvedValue([
      { key: 'reviews.2gis', value: 'https://2gis.ru/kazan/firm/1', updatedAt: null },
    ]);
    expect((await put({ twoGis: '' })).status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({ where: { key: 'reviews.2gis' } });
  });
});
