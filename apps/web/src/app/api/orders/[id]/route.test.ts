import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const orderFindUnique = vi.fn();
const companyFindUnique = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { order: { findUnique: orderFindUnique }, company: { findUnique: companyFindUnique } },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/orderChatAccess', () => ({
  unreadMessagesByOrder: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/lib/companyStats', () => ({ loadCompanyStats: vi.fn().mockResolvedValue(new Map()) }));

const { GET } = await import('./route');

const LOCATION = {
  addressLine: 'Казань, ул. Баумана, 1',
  city: 'Казань',
  latitude: 55.7887,
  longitude: 49.1221,
};
const CUSTOMER = { id: 'cust', name: 'Анна Петрова', role: 'CUSTOMER', companyId: null };
const PROVIDER = { id: 'prov', name: 'Иван', role: 'PROVIDER_ADMIN', companyId: 'other-co' };

function order(booking: { status: string; equipment: { companyId: string } } | null = null) {
  return {
    id: 'o1',
    customerId: 'cust',
    status: booking ? 'MATCHED' : 'OPEN',
    description: 'Нужен кран',
    contactName: null,
    contactPhone: null,
    rawText: null,
    sourceUrl: null,
    externalId: null,
    fingerprint: null,
    buyer: null,
    category: { id: 'cat', name: 'Автокран' },
    customer: { id: 'cust', name: 'Анна Петрова' },
    location: LOCATION,
    bids: [],
    booking,
  };
}

async function get() {
  const response = await GET(new NextRequest('http://localhost/api/orders/o1'), {
    params: { id: 'o1' },
  });
  return (await response.json()) as { order: { location: Record<string, unknown> } };
}

describe('GET /api/orders/[id]: the work site (REVIEW.md §1)', () => {
  beforeEach(() => {
    orderFindUnique.mockReset();
    companyFindUnique.mockReset().mockResolvedValue({ baseLat: 55.9, baseLon: 48.8 });
    getRequestUser.mockReset();
  });

  it('gives the customer the full address', async () => {
    getRequestUser.mockResolvedValue(CUSTOMER);
    orderFindUnique.mockResolvedValue(order());
    const { order: body } = await get();
    expect(body.location).toEqual(LOCATION);
    expect(companyFindUnique).not.toHaveBeenCalled();
  });

  it('gives another provider only the city and the distance before the booking', async () => {
    getRequestUser.mockResolvedValue(PROVIDER);
    orderFindUnique.mockResolvedValue(order());
    const { order: body } = await get();
    expect(body.location).toEqual({
      addressLine: null,
      city: 'Казань',
      latitude: null,
      longitude: null,
      distanceKm: expect.any(Number),
    });
    expect(JSON.stringify(body)).not.toContain('Баумана');
    expect(JSON.stringify(body)).not.toContain('49.12');
  });

  it('keeps the address from the booked company until it confirms', async () => {
    getRequestUser.mockResolvedValue(PROVIDER);
    orderFindUnique.mockResolvedValue(
      order({ status: 'PENDING', equipment: { companyId: 'other-co' } }),
    );
    const { order: body } = await get();
    expect(body.location.addressLine).toBeNull();
  });

  it('opens the address to the booked company once the booking is confirmed', async () => {
    getRequestUser.mockResolvedValue(PROVIDER);
    orderFindUnique.mockResolvedValue(
      order({ status: 'CONFIRMED', equipment: { companyId: 'other-co' } }),
    );
    const { order: body } = await get();
    expect(body.location).toEqual(LOCATION);
  });

  it('never opens it to a provider that is not the booked one', async () => {
    getRequestUser.mockResolvedValue(PROVIDER);
    orderFindUnique.mockResolvedValue(
      order({ status: 'CONFIRMED', equipment: { companyId: 'someone-else' } }),
    );
    const { order: body } = await get();
    expect(body.location.addressLine).toBeNull();
    expect(body.location.latitude).toBeNull();
  });
});
