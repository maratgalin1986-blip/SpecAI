import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findMany = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { linePresence: { findMany } }, Prisma: {} }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { GET } = await import('./route');

const presence = {
  id: 'p1',
  userId: 'driver-user-id',
  companyId: 'c1',
  equipmentId: 'e1',
  online: true,
  lat: 55.745,
  lon: 52.4,
  note: null,
  updatedAt: new Date(),
  user: { name: 'Пётр Иванов' },
  company: { id: 'c1', name: 'Казанская Спецтехника', verified: true },
  equipment: {
    id: 'e1',
    name: 'Бульдозер CAT D6',
    companyId: 'c1',
    status: 'AVAILABLE',
    hourlyRate: 3250,
    dailyRate: 26000,
    category: { name: 'Бульдозеры', slug: 'bulldozers' },
  },
};

async function get(query = '') {
  const response = await GET(new NextRequest(`http://localhost/api/line/nearby${query}`));
  return { status: response.status, body: await response.json() };
}

describe('GET /api/line/nearby', () => {
  beforeEach(() => {
    findMany.mockReset();
    getRequestUser.mockReset();
    getRequestUser.mockResolvedValue({ id: 'cust', role: 'CUSTOMER' });
    findMany.mockResolvedValue([presence]);
  });

  it('without a point gives the whole fresh list, never filtered around (0,0)', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.around).toBeNull();
    expect(body.machines).toHaveLength(1);
    expect(body.machines[0].id).toBe('p1');
    expect(JSON.stringify(body)).not.toContain('driver-user-id');
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where.lat).toBeUndefined();
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    expect(args.take).toBe(200);
  });

  it('with only one coordinate behaves as without a point', async () => {
    const { body } = await get('?lat=55.74');
    expect(body.around).toBeNull();
    expect(body.machines).toHaveLength(1);
  });

  it('around a point filters by a bounding box in SQL and the radius in code', async () => {
    const { body } = await get('?lat=55.74312&lon=52.39811');
    expect(body.around).toEqual({ lat: 55.74312, lon: 52.39811 });
    expect(body.km).toBe(60);
    expect(body.machines[0].distanceKm).toBeCloseTo(0.2, 0);
    const where = findMany.mock.calls[0]?.[0].where;
    expect(where.lat.gte).toBeLessThan(55.74312);
    expect(where.lat.lte).toBeGreaterThan(55.74312);
    expect(where.lon.gte).toBeLessThan(52.39811);
  });

  it('requires a signed-in user', async () => {
    getRequestUser.mockResolvedValue(null);
    const { status } = await get();
    expect(status).toBe(401);
  });
});
