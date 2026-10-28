import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRequestUser = vi.fn();
const isAdminRequest = vi.fn();
const findUnique = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { storedFile: { findUnique } } }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET } = await import('./route');
const publicFiles = await import('../../files/[...key]/route');

const KEY = ['private', 'verification', 'comp1', 'rnd-sts.jpg'];
const file = { contentType: 'image/jpeg', data: Buffer.from('jpg') };

async function get(key = KEY) {
  return GET(new NextRequest('http://localhost/api/private-files/x'), { params: { key } });
}

describe('GET /api/private-files: фото СТС', () => {
  beforeEach(() => {
    getRequestUser.mockReset();
    isAdminRequest.mockReset().mockReturnValue(false);
    findUnique.mockReset().mockResolvedValue(file);
  });

  it('отдаёт админу своей компании, без кэша', async () => {
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'comp1' });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('отдаёт админу площадки', async () => {
    getRequestUser.mockResolvedValue(null);
    isAdminRequest.mockReturnValue(true);
    expect((await get()).status).toBe(200);
  });

  it('чужой компании, машинисту, заказчику и гостю — 404, базу не читает', async () => {
    for (const user of [
      { id: 'u2', role: 'PROVIDER_ADMIN', companyId: 'comp2' },
      { id: 'u3', role: 'PROVIDER_OPERATOR', companyId: 'comp1' },
      { id: 'u4', role: 'CUSTOMER', companyId: null },
      null,
    ]) {
      getRequestUser.mockResolvedValue(user);
      expect((await get()).status).toBe(404);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('публичный /api/files закрытые ключи не отдаёт', async () => {
    const response = await publicFiles.GET(new Request('http://localhost/api/files/x'), {
      params: { key: KEY },
    });
    expect(response.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
