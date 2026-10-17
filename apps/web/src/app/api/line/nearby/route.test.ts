import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findMany = vi.fn();
const equipmentFindMany = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { linePresence: { findMany }, equipment: { findMany: equipmentFindMany } },
  Prisma: {},
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { GET } = await import('./route');
const { HOUSE_COMPANY_ID } = await import('@/lib/fleet');

/** A house machine at the company's base (Набережные Челны), priced below the list. */
const houseMachine = (over: Record<string, unknown> = {}) => ({
  id: 'sp16-jcb',
  name: 'Экскаватор-погрузчик JCB 3CX',
  companyId: HOUSE_COMPANY_ID,
  status: 'AVAILABLE',
  hourlyRate: 100,
  dailyRate: 800,
  category: { name: 'Экскаваторы-погрузчики', slug: 'backhoe-loaders' },
  location: { latitude: null, longitude: null },
  company: { baseLat: 55.7436, baseLon: 52.3959 },
  ...over,
});

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
    equipmentFindMany.mockReset();
    equipmentFindMany.mockResolvedValue([]);
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

  it('adds СпецПласт16 machines at the base: priced by the list, labelled, no user ids', async () => {
    equipmentFindMany.mockResolvedValue([houseMachine()]);
    const { body } = await get('?lat=55.74312&lon=52.39811');
    expect(body.machines).toHaveLength(1);
    expect(body.base).toHaveLength(1);
    const [pin] = body.base;
    expect(pin.id).toBe('sp16-jcb');
    expect(pin.equipment.id).toBe('sp16-jcb');
    expect(pin.company).toEqual({ name: 'СпецПласт16', isHouse: true });
    // The house floor (customerRates), not the 100 ₽ stored by mistake.
    expect(pin.equipment.hourlyRate).toBeGreaterThan(100);
    expect(pin.bubble.startsWith('СпецПласт16 · Экскаватор-погрузчик JCB 3CX · от ')).toBe(true);
    expect(pin.bubble.endsWith(' · на базе')).toBe(true);
    expect(pin.bubble).not.toContain('Я на линии');
    expect(pin.priceText).toMatch(/^от .+₽\/ч$/);
    const json = JSON.stringify(body);
    expect(json).not.toContain('driver-user-id');
    expect(json).not.toContain('userId');
    // Only the free house fleet, without machines whose driver is online.
    const where = equipmentFindMany.mock.calls[0]?.[0].where;
    expect(where.companyId).toBe(HOUSE_COMPANY_ID);
    expect(where.status).toBe('AVAILABLE');
    expect(where.linePresences.none.online).toBe(true);
    expect(equipmentFindMany.mock.calls[0]?.[0].take).toBe(500);
  });

  it('keeps base pins within the radius and a house machine on the line out of them', async () => {
    equipmentFindMany.mockResolvedValue([
      houseMachine(),
      houseMachine({ id: 'sp16-far', location: { latitude: 55.79, longitude: 49.11 } }),
      houseMachine({ id: 'e1' }),
    ]);
    const { body } = await get('?lat=55.74312&lon=52.39811');
    expect(body.base.map((pin: { id: string }) => pin.id)).toEqual(['sp16-jcb']);
    const wide = await get('?lat=55.74312&lon=52.39811&km=300');
    expect(wide.body.base.map((pin: { id: string }) => pin.id)).toEqual(['sp16-jcb', 'sp16-far']);
  });
});
