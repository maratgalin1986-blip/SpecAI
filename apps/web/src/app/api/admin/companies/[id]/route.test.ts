import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { company: { findUnique, update } } }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { PATCH } = await import('./route');

async function patch(body: unknown) {
  const response = await PATCH(
    new NextRequest('http://localhost/api/admin/companies/c1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: { id: 'c1' } },
  );
  return response.status;
}

describe('PATCH /api/admin/companies/[id]: решение по проверке', () => {
  beforeEach(() => {
    isAdminRequest.mockReset().mockReturnValue(true);
    findUnique.mockReset();
    update.mockReset().mockResolvedValue({ id: 'c1', verified: true, provisional: false });
  });

  it('без входа админа — 401', async () => {
    isAdminRequest.mockReturnValue(false);
    expect(await patch({ decision: 'approve' })).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('одобрение снимает «provisional» и ставит «Проверен»', async () => {
    findUnique.mockResolvedValue({
      verified: false,
      provisional: true,
      verificationRequestedAt: new Date(),
    });
    expect(await patch({ decision: 'approve' })).toBe(200);
    expect(update.mock.calls[0]![0].data).toMatchObject({ verified: true, provisional: false });
  });

  it('вернуть можно только «на проверке» и с причиной', async () => {
    findUnique.mockResolvedValue({ verified: false, provisional: true });
    expect(await patch({ decision: 'reject', reason: 'Нет фото' })).toBe(409);
    findUnique.mockResolvedValue({ verified: false, verificationRequestedAt: new Date() });
    expect(await patch({ decision: 'reject' })).toBe(400);
    expect(await patch({ decision: 'reject', reason: 'Фото не читается' })).toBe(200);
    expect(update.mock.calls[0]![0].data).toMatchObject({
      verified: false,
      verificationRequestedAt: null,
      verificationRejectedReason: 'Фото не читается',
    });
  });

  it('старый переключатель { verified } работает как раньше', async () => {
    findUnique.mockResolvedValue({ verified: true });
    expect(await patch({ verified: false })).toBe(200);
    expect(update.mock.calls[0]![0].data).toMatchObject({ verified: false });
  });
});
