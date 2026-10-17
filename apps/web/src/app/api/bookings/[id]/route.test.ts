import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const updateMany = vi.fn();
const findUniqueOrThrow = vi.fn();
const getRequestUser = vi.fn();
const tx = { booking: { updateMany, findUniqueOrThrow, update: vi.fn() }, order: {}, bid: {} };
vi.mock('@specai/database', () => ({
  prisma: {
    booking: { findUnique },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/bookingConflicts', () => ({
  lockEquipment: vi.fn(),
  findOverlappingBooking: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/notifications/notifyUser', () => ({
  notifyUser: vi.fn(),
  notifyCompany: vi.fn(),
}));
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }));

const { PATCH } = await import('./route');

const start = new Date(Date.now() + 3 * 86_400_000);
const booking = (status: string) => ({
  id: 'b1',
  status,
  startDate: start,
  endDate: start,
  notes: null,
  orderId: null,
  customerId: 'cust',
  equipmentId: 'e1',
  equipment: { name: 'JCB', companyId: 'c1' },
  customer: { email: 'a@b.c' },
  payment: null,
});

async function patch(status: string) {
  return PATCH(
    new NextRequest('http://localhost/api/bookings/b1', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    { params: { id: 'b1' } },
  );
}

describe('PATCH /api/bookings/[id] — confirmedAt', () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockReset();
    getRequestUser.mockReset();
    getRequestUser.mockResolvedValue({ id: 'prov', role: 'PROVIDER_ADMIN', companyId: 'c1' });
  });

  it('stamps the moment the provider confirms (the activity strip counts it)', async () => {
    findUnique.mockResolvedValue(booking('PENDING'));
    findUniqueOrThrow.mockResolvedValue(booking('CONFIRMED'));
    const response = await patch('CONFIRMED');
    expect(response.status).toBe(200);
    expect(updateMany.mock.calls[0]?.[0].data.confirmedAt).toBeInstanceOf(Date);
  });

  it('leaves it alone on other moves', async () => {
    findUnique.mockResolvedValue(booking('CONFIRMED'));
    findUniqueOrThrow.mockResolvedValue(booking('CANCELLED'));
    await patch('CANCELLED');
    expect(updateMany.mock.calls[0]?.[0].data.confirmedAt).toBeUndefined();
  });
});
