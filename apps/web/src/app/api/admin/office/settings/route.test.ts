import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const upsert = vi.fn((args: unknown) => ({ op: 'upsert', args }));
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('@specai/database', () => ({
  prisma: { appSetting: { upsert }, $transaction: transaction },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { PUT } = await import('./route');

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe('PUT /api/admin/office/settings — реквизиты для оплаты (S6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
  });

  it('refuses without the admin session (an async check is awaited)', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await put({ payDetails: 'ООО «Пример»' });
    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saves the pay details trimmed, an empty text clears them', async () => {
    expect((await put({ payDetails: '  ООО «Пример»\nр/с …  ' })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'office.payDetails' },
      update: { value: 'ООО «Пример»\nр/с …' },
      create: { key: 'office.payDetails', value: 'ООО «Пример»\nр/с …' },
    });
    upsert.mockClear();
    expect((await put({ payDetails: '   ' })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: '' },
        create: { key: 'office.payDetails', value: '' },
      }),
    );
  });

  it('rejects text longer than 2000 characters or not a string', async () => {
    for (const payDetails of ['я'.repeat(2001), 42]) {
      const response = await put({ payDetails });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Реквизиты/);
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});
