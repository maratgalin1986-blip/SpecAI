import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findFirst = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { equipment: { findFirst } }, Prisma: {} }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { GET } = await import('./route');

const machine = {
  id: 'm1',
  name: 'КамАЗ',
  companyId: 'specplast16-house',
  status: 'RETIRED',
  hourlyRate: '2300',
  dailyRate: '18400',
  imageUrls: [],
  category: { name: 'Самосвал' },
};

async function get(query = '') {
  const response = await GET(new NextRequest(`http://localhost/api/equipment/m1${query}`), {
    params: { id: 'm1' },
  });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/equipment/[id]', () => {
  beforeEach(() => {
    findFirst.mockReset();
    getRequestUser.mockReset();
  });

  it('gives a customer the list price, never the lower stored one', async () => {
    getRequestUser.mockResolvedValue(null);
    findFirst.mockResolvedValue({ ...machine, status: 'AVAILABLE' });
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.equipment.hourlyRate).toBe(3300);
    expect(findFirst.mock.calls[0]?.[0].where.status).toEqual({ not: 'RETIRED' });
  });

  it('gives the owning provider its machine in any status with stored prices', async () => {
    getRequestUser.mockResolvedValue({ role: 'PROVIDER_ADMIN', companyId: 'specplast16-house' });
    findFirst.mockResolvedValue({ ...machine, imageUrls: ['/uploads/kamaz.jpg'] });
    const { status, body } = await get('?mine=1');
    expect(status).toBe(200);
    expect(body.equipment.imageUrls).toEqual(['/uploads/kamaz.jpg']);
    expect(body.equipment.hourlyRate).toBe('2300');
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'm1',
      companyId: 'specplast16-house',
    });
  });

  it('shows the customer view to a provider without ?mine=1', async () => {
    getRequestUser.mockResolvedValue({ role: 'PROVIDER_ADMIN', companyId: 'specplast16-house' });
    findFirst.mockResolvedValue({ ...machine, status: 'AVAILABLE' });
    const { body } = await get();
    expect(body.equipment.hourlyRate).toBe(3300);
    expect(findFirst).toHaveBeenCalledOnce();
  });
});
