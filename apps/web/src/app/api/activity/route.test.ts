import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orderCount = vi.fn();
const orderFindMany = vi.fn();
const bookingCount = vi.fn();
const bookingFindMany = vi.fn();
const lineFindMany = vi.fn();
const equipmentFindMany = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('@specai/database', () => ({
  prisma: {
    order: { count: orderCount, findMany: orderFindMany },
    booking: { count: bookingCount, findMany: bookingFindMany },
    linePresence: { findMany: lineFindMany },
    equipment: { findMany: equipmentFindMany },
  },
}));
// No Data Cache in tests: the loader runs on every call.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));

const { GET } = await import('./route');

describe('GET /api/activity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T09:00:00Z'));
    for (const fn of [orderCount, orderFindMany, bookingCount, bookingFindMany, lineFindMany]) {
      fn.mockReset();
    }
    orderCount.mockResolvedValue(14);
    bookingCount.mockResolvedValue(2);
    lineFindMany.mockResolvedValue([
      {
        online: true,
        onlineSince: new Date('2026-10-17T08:50:00Z'),
        updatedAt: new Date('2026-10-17T08:59:00Z'),
        lat: 55.74,
        lon: 52.4,
        companyId: 'c1',
        equipment: { id: 'e1', status: 'AVAILABLE', category: { name: 'Экскаваторы' } },
      },
    ]);
    orderFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-10-17T08:48:00Z'),
        status: 'OPEN',
        source: 'WHATSAPP',
        category: { name: 'Самосвалы' },
        location: { city: 'Елабуга', latitude: null, longitude: null },
      },
    ]);
    bookingFindMany.mockResolvedValue([]);
  });

  it('is public, cached for a minute and holds the real numbers', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
    const body = await response.json();
    expect(body.today).toEqual({ orders: 14, online: 1, confirmed: 2 });
    expect(body.summary).toBe('Сегодня: 14 заявок · 1 машина на линии · 2 брони подтверждены');
    expect(body.events.map((event: { text: string }) => event.text)).toEqual([
      'Машина вышла на линию: экскаваторы · Набережные Челны',
      'Новая заявка из чата: самосвалы, Елабуга',
    ]);
  });

  it('counts СпецПласт16 free machines as on the line without a ping, but not one booked today', async () => {
    const house = (id: string) => ({
      id,
      companyId: 'specplast16-house',
      status: 'AVAILABLE',
      categoryId: 'cat',
      location: null,
      company: { baseLat: 55.7436, baseLon: 52.3959 },
    });
    equipmentFindMany.mockResolvedValueOnce([house('h1'), house('h2'), house('h3')]);
    // The event query asks by confirmedAt, the house line by its machines.
    bookingFindMany.mockImplementation(async (args: { where: { equipmentId?: unknown } }) =>
      args.where.equipmentId
        ? [
            {
              equipmentId: 'h3',
              status: 'CONFIRMED',
              startDate: new Date('2026-10-17T05:00:00Z'),
              endDate: new Date('2026-10-17T14:00:00Z'),
            },
          ]
        : [],
    );
    const body = await (await GET()).json();
    // The other provider's machine and two free house machines; no invented event.
    expect(body.today.online).toBe(3);
    expect(body.summary).toContain('3 машины на линии');
    expect(body.events.filter((event: { kind: string }) => event.kind === 'line')).toHaveLength(1);
    const asked = (equipmentFindMany.mock.calls as unknown[][]).at(-1)?.[0] as { where: unknown };
    expect(asked.where).toEqual({
      companyId: 'specplast16-house',
      status: 'AVAILABLE',
    });
    // Standing lines of every provider are read, not only live GPS.
    expect(lineFindMany.mock.calls[0]?.[0].where.OR).toHaveLength(3);
  });

  it('counts by the Moscow day and never PENDING_REVIEW or CANCELLED orders', async () => {
    await GET();
    const countWhere = orderCount.mock.calls[0]?.[0].where;
    expect(countWhere.createdAt.gte.toISOString()).toBe('2026-10-16T21:00:00.000Z');
    expect(countWhere.status.in).toEqual(['OPEN', 'MATCHED']);
    const bookingWhere = bookingCount.mock.calls[0]?.[0].where;
    expect(bookingWhere.confirmedAt.gte.toISOString()).toBe('2026-10-16T21:00:00.000Z');
    // The event rows select nothing personal.
    const select = orderFindMany.mock.calls[0]?.[0].select;
    expect(Object.keys(select).sort()).toEqual([
      'category',
      'createdAt',
      'location',
      'source',
      'status',
    ]);
    expect(orderFindMany.mock.calls[0]?.[0].take).toBe(8);
  });

  it('answers 503 rather than a made-up quiet day when the database is away', async () => {
    orderCount.mockRejectedValue(new Error('down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    errors.mockRestore();
  });
});
