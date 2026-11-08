import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const companyFindMany = vi.fn();
const companyFindFirst = vi.fn();
vi.mock('@specai/database', () => ({
  HOUSE_COMPANY_ID: 'specplast16-house',
  prisma: { company: { findMany: companyFindMany, findFirst: companyFindFirst } },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET } = await import('./route');

async function get() {
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

describe('GET /api/admin/companies: «Исполнители» in the app', () => {
  beforeEach(() => {
    isAdminRequest.mockReset();
    companyFindMany.mockReset();
    companyFindFirst.mockReset();
    companyFindFirst.mockResolvedValue(null);
    isAdminRequest.mockReturnValue(true);
  });

  it('refuses without the admin session and does not touch the database', async () => {
    isAdminRequest.mockReturnValue(false);
    const { status, body } = await get();
    expect(status).toBe(401);
    expect(body.error).toBe('Нет доступа');
    expect(companyFindMany).not.toHaveBeenCalled();
  });

  it('lists providers with the working fleet, the house company always first', async () => {
    companyFindFirst.mockResolvedValue({
      id: 'specplast16-house',
      name: 'СпецПласт16',
      phone: null,
      verified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      _count: { equipment: 7 },
    });
    companyFindMany.mockResolvedValue([
      {
        id: 'c2',
        name: 'ИП Петров',
        phone: '+79170000000',
        verified: false,
        createdAt: '2026-10-16T10:00:00.000Z',
        _count: { equipment: 2 },
      },
    ]);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.companies.map((c: { id: string }) => c.id)).toEqual(['specplast16-house', 'c2']);
    expect(body.companies[1]).toEqual({
      id: 'c2',
      name: 'ИП Петров',
      phone: '+79170000000',
      verified: false,
      createdAt: '2026-10-16T10:00:00.000Z',
      machines: 2,
      isHouse: false,
    });
    // The newest 100 others; the house company is read on its own, so it is
    // never cut off however many providers there are.
    const query = companyFindMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ isProvider: true, id: { not: 'specplast16-house' } });
    expect(query.take).toBe(100);
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(companyFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'specplast16-house',
      isProvider: true,
    });
  });
});
