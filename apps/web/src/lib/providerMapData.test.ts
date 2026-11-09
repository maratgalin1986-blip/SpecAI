import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@specai/database';
import { HOUSE_COMPANY_ID } from './fleet';
import { loadMapPins } from './providerMapData';

// «Все видят всех, офлайн и навсегда» (owner, 2026-11-08) against a fake
// database: who reaches the map and with which fields.

const company = (over: Record<string, unknown>) => ({
  id: 'c1',
  name: 'Стройтех',
  isProvider: true,
  baseLat: 55.75,
  baseLon: 52.41,
  baseAddress: 'Набережные Челны, ул. Строителей, 7',
  phone: '+7 (927) 100-00-00',
  pinImageUrl: null,
  pinNote: null,
  showOnMap: null,
  showPhoneOnMap: null,
  _count: { equipment: 2 },
  equipment: [
    {
      name: 'Hitachi ZX200',
      companyId: 'c1',
      hourlyRate: 4000,
      dailyRate: 32000,
      category: { name: 'Гусеничные экскаваторы' },
      location: null,
    },
    {
      name: 'КамАЗ 6520',
      companyId: 'c1',
      hourlyRate: null,
      dailyRate: 18000,
      category: { name: 'Самосвалы' },
      location: null,
    },
  ],
  ...over,
});

function fakePrisma(rows: { companies: unknown[]; presences?: unknown[]; orders?: unknown[] }) {
  const companyFindMany = vi.fn(async () => rows.companies);
  const presenceFindMany = vi.fn(async () => rows.presences ?? []);
  const orderFindMany = vi.fn(async () => rows.orders ?? []);
  const prisma = {
    company: { findMany: companyFindMany },
    linePresence: { findMany: presenceFindMany },
    order: { findMany: orderFindMany },
  } as unknown as PrismaClient;
  return { prisma, companyFindMany, presenceFindMany, orderFindMany };
}

describe('loadMapPins', () => {
  it('shows an offline provider with its phone, hides one by its own switch, keeps the phone switch', async () => {
    const now = new Date('2026-11-08T09:00:00Z');
    const { prisma } = fakePrisma({
      companies: [
        company({}),
        company({ id: 'hidden', name: 'Скрытый', showOnMap: false }),
        company({ id: 'quiet', name: 'Без номера', showPhoneOnMap: false, baseLat: 55.76 }),
        company({
          id: 'online',
          name: 'На линии',
          baseLat: 55.77,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        }),
      ],
      presences: [
        {
          companyId: 'online',
          online: false,
          updatedAt: new Date('2026-11-01T00:00:00Z'),
          onlineSince: null,
          timeZone: 'Europe/Moscow',
          standingUntil: new Date('2026-11-14T00:00:00Z'),
          standingForever: false,
          gpsAt: null,
          equipment: { status: 'AVAILABLE' },
        },
      ],
    });
    const { providers } = await loadMapPins(prisma, { now });
    const ids = providers.map((pin) => pin.id);
    expect(ids).toEqual(expect.arrayContaining(['c1', 'quiet', 'online']));
    expect(ids).not.toContain('hidden');

    const offline = providers.find((pin) => pin.id === 'c1');
    expect(offline).toMatchObject({
      onLine: false,
      phone: '+7 927 100-00-00',
      phoneHref: 'tel:+79271000000',
      city: 'Набережные Челны',
      machines: ['Гусеничные экскаваторы', 'Самосвалы'],
      priceText: 'от 18\u00a0000\u00a0₽/смена',
    });
    expect(providers.find((pin) => pin.id === 'quiet')?.phone).toBeNull();
    expect(providers.find((pin) => pin.id === 'online')?.onLine).toBe(true);

    const json = JSON.stringify(providers);
    expect(json).not.toContain('Строителей'); // the address stays home
    expect(json).not.toContain('2026-10-01'); // no registration date
  });

  it('a standing line on a machine that is not free does not light the pin', async () => {
    const { prisma } = fakePrisma({
      companies: [company({})],
      presences: [
        {
          companyId: 'c1',
          online: false,
          updatedAt: new Date(),
          onlineSince: null,
          timeZone: null,
          standingUntil: null,
          standingForever: true,
          gpsAt: null,
          equipment: { status: 'RENTED' },
        },
      ],
    });
    const { providers } = await loadMapPins(prisma);
    expect(providers[0]?.onLine).toBe(false);
  });

  it('customers come from open orders without a phone or an address, at a rounded point', async () => {
    const { prisma } = fakePrisma({
      companies: [],
      orders: [
        {
          id: 'o1',
          contactName: null,
          category: { name: 'Автокраны' },
          customer: { name: 'Анна Петрова' },
          location: {
            latitude: 55.743612,
            longitude: 52.395987,
            city: 'Набережные Челны',
            addressLine: 'проспект Мира, 49',
          },
          contactPhone: '+79270000000',
        },
      ],
    });
    const { customers } = await loadMapPins(prisma);
    expect(customers).toEqual([
      {
        id: 'o1',
        lat: 55.74,
        lon: 52.4,
        title: 'Заказчик рядом',
        sub: 'нужно: Автокраны · Анна П.',
        machinery: 'Автокраны',
        customer: 'Анна П.',
        orderUrl: '/orders/o1',
        approximate: true,
      },
    ]);
    expect(JSON.stringify(customers)).not.toContain('9270000000');
    expect(JSON.stringify(customers)).not.toContain('Мира');
  });

  it('asks the database for the viewport only and caps the answer, the house fleet first', async () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      company({ id: `c${index}`, name: `Компания ${index}`, baseLat: 55.7 + index * 0.01 }),
    );
    many.push(company({ id: HOUSE_COMPANY_ID, name: 'СпецПласт16', baseLat: 55.9 }));
    const { prisma, companyFindMany } = fakePrisma({ companies: many });
    const bbox = { south: 55.6, west: 52, north: 56, east: 53 };
    const { providers, customers } = await loadMapPins(prisma, { bbox, limit: 3 });
    expect(providers).toHaveLength(3);
    expect(providers[0]?.id).toBe(HOUSE_COMPANY_ID);
    expect(customers).toEqual([]);
    const where = (companyFindMany.mock.calls[0] as unknown[])[0] as {
      where: { AND: { OR: Record<string, unknown>[] }[] };
    };
    expect(JSON.stringify(where.where)).toContain('"gte":55.6');
    expect(JSON.stringify(where.where)).toContain('"lte":53');
  });
});
