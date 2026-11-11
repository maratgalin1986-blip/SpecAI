import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findMany = vi.fn();
const equipmentFindMany = vi.fn();
const getRequestUser = vi.fn();
const bookingFindMany = vi.fn(async (_args?: unknown): Promise<unknown[]> => []);
vi.mock('@specai/database', () => ({
  prisma: {
    linePresence: { findMany },
    equipment: { findMany: equipmentFindMany },
    booking: { findMany: bookingFindMany },
  },
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
    const liveWhere = args.where.OR[0];
    expect(liveWhere.lat).toBeUndefined();
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    expect(args.take).toBe(200);
    // Sessions begun over a day ago (phones left on) do not use up the cap.
    expect(liveWhere.OR[0]).toEqual({ onlineSince: null });
    // «На линии на 5 рабочих дней»: standing rows are read without GPS.
    expect(args.where.OR[1]).toEqual({ standingForever: true });
    expect(args.where.OR[2].standingUntil.gt).toBeInstanceOf(Date);
    expect(Date.now() - liveWhere.OR[1].onlineSince.gte.getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60_000 - 1000,
    );
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
    const where = findMany.mock.calls[0]?.[0].where.OR[0];
    expect(where.lat.gte).toBeLessThan(55.74312);
    expect(where.lat.lte).toBeGreaterThan(55.74312);
    expect(where.lon.gte).toBeLessThan(52.39811);
  });

  it('requires a signed-in user', async () => {
    getRequestUser.mockResolvedValue(null);
    const { status } = await get();
    expect(status).toBe(401);
  });

  it('puts СпецПласт16 free machines on the line without any phone: priced by the list, no user ids', async () => {
    equipmentFindMany.mockResolvedValue([houseMachine()]);
    const { body } = await get('?lat=55.74312&lon=52.39811');
    expect(body.machines).toHaveLength(2);
    // «Всегда на линии» (owner, 2026-11-11): not «на базе» any more.
    expect(body.base).toEqual([]);
    const pin = body.machines.find(
      (machine: { equipment: { id: string } }) => machine.equipment.id === 'sp16-jcb',
    );
    expect(pin.id).toBe('house-line-sp16-jcb');
    expect(pin.company).toEqual({
      id: HOUSE_COMPANY_ID,
      name: 'СпецПласт16',
      verified: true,
      isHouse: true,
    });
    expect(pin.live).toBe(false);
    expect(pin.until).toBe('до отключения');
    expect(pin.busyToday).toBe(false);
    expect({ lat: pin.lat, lon: pin.lon }).toEqual({ lat: 55.7436, lon: 52.3959 });
    // The house floor (customerRates), not the 100 ₽ stored by mistake.
    expect(pin.equipment.hourlyRate).toBeGreaterThan(100);
    expect(pin.bubble).toMatch(
      /^Я на линии до отключения · Экскаватор-погрузчик JCB 3CX · от .+₽\/ч$/,
    );
    const json = JSON.stringify(body);
    expect(json).not.toContain('driver-user-id');
    expect(json).not.toContain('userId');
    // The whole free house fleet, whatever its presence rows say.
    const where = equipmentFindMany.mock.calls[0]?.[0].where;
    expect(where).toEqual({ companyId: HOUSE_COMPANY_ID, status: 'AVAILABLE' });
    expect(equipmentFindMany.mock.calls[0]?.[0].take).toBe(500);
  });

  it('keeps house machines within the radius and shows a machine with a real row once', async () => {
    equipmentFindMany.mockResolvedValue([
      houseMachine(),
      houseMachine({ id: 'sp16-far', location: { latitude: 55.79, longitude: 49.11 } }),
      houseMachine({ id: 'e1' }),
    ]);
    const ids = (body: { machines: { equipment: { id: string } }[] }) =>
      body.machines.map((machine) => machine.equipment.id).sort();
    const { body } = await get('?lat=55.74312&lon=52.39811');
    expect(ids(body)).toEqual(['e1', 'sp16-jcb']);
    const wide = await get('?lat=55.74312&lon=52.39811&km=300');
    expect(ids(wide.body)).toEqual(['e1', 'sp16-far', 'sp16-jcb']);
    // «e1» is the phone's own row (fresh GPS), not a second standing one.
    expect(
      wide.body.machines.filter((m: { id: string }) => m.id.startsWith('house-line-')),
    ).toHaveLength(2);
    expect(wide.body.base).toEqual([]);
  });

  it('shows a house machine booked today as «Занята сегодня», as any provider’s', async () => {
    equipmentFindMany.mockResolvedValue([houseMachine(), houseMachine({ id: 'sp16-busy' })]);
    const now = Date.now();
    bookingFindMany.mockResolvedValueOnce([
      {
        equipmentId: 'sp16-busy',
        status: 'CONFIRMED',
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 3_600_000),
      },
    ]);
    const { body } = await get();
    const asked = bookingFindMany.mock.calls.at(-1)?.[0] as {
      where: { equipmentId: { in: string[] } };
    };
    expect(asked.where.equipmentId.in).toEqual(expect.arrayContaining(['sp16-jcb', 'sp16-busy']));
    const busy = body.machines.find(
      (machine: { equipment: { id: string } }) => machine.equipment.id === 'sp16-busy',
    );
    expect(busy.busyToday).toBe(true);
    expect(busy.bubble.startsWith('Занята сегодня')).toBe(true);
    expect(body.machines.at(-1).equipment.id).toBe('sp16-busy');
  });

  describe('the evening cutoff', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('hides a machine whose session the cutoff ended, in the phone’s own zone', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 21:30 in Moscow, 20:30 in Kaliningrad; both sessions began at 08:00 local.
      const now = new Date('2026-10-17T18:30:00Z');
      vi.setSystemTime(now);
      findMany.mockResolvedValue([
        {
          ...presence,
          updatedAt: now,
          onlineSince: new Date('2026-10-17T05:00:00Z'),
          timeZone: 'Europe/Moscow',
        },
        {
          ...presence,
          id: 'p2',
          userId: 'other-driver',
          equipmentId: 'e2',
          equipment: { ...presence.equipment, id: 'e2' },
          updatedAt: now,
          onlineSince: new Date('2026-10-17T06:00:00Z'),
          timeZone: 'Europe/Kaliningrad',
        },
      ]);
      const { body } = await get();
      expect(body.machines.map((machine: { id: string }) => machine.id)).toEqual(['p2']);
    });

    it('hides a session begun yesterday, shows one begun after the cutoff', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = new Date('2026-10-17T19:00:00Z'); // 22:00 MSK
      vi.setSystemTime(now);
      findMany.mockResolvedValue([
        { ...presence, updatedAt: now, onlineSince: new Date('2026-10-16T06:00:00Z') },
        {
          ...presence,
          id: 'p2',
          equipmentId: 'e2',
          equipment: { ...presence.equipment, id: 'e2' },
          updatedAt: now,
          onlineSince: new Date('2026-10-17T18:40:00Z'),
        },
      ]);
      const { body } = await get();
      expect(body.machines.map((machine: { id: string }) => machine.id)).toEqual(['p2']);
    });
  });
});
