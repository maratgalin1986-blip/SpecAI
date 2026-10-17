import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn();
const orderFindMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { order: { findMany: orderFindMany } } }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET } = await import('./route');

async function get(query = '') {
  const response = await GET(new NextRequest(`http://localhost/api/admin/orders${query}`));
  return { status: response.status, body: await response.json() };
}

describe('GET /api/admin/orders: chat orders in the app', () => {
  beforeEach(() => {
    isAdminRequest.mockReset();
    orderFindMany.mockReset();
    isAdminRequest.mockReturnValue(true);
    orderFindMany.mockResolvedValue([]);
  });

  it('refuses without the admin session', async () => {
    isAdminRequest.mockReturnValue(false);
    const { status } = await get();
    expect(status).toBe(401);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it('lists orders waiting for moderation by default, newest first, at most 50', async () => {
    orderFindMany.mockResolvedValue([{ id: 'o1', contactPhone: '+79170000000' }]);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.orders).toEqual([{ id: 'o1', contactPhone: '+79170000000' }]);
    const query = orderFindMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ status: 'PENDING_REVIEW' });
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(query.take).toBe(50);
    expect(query.select.contactPhone).toBe(true);
  });

  it('accepts only OPEN besides the default status', async () => {
    await get('?status=OPEN');
    expect(orderFindMany.mock.calls[0]?.[0].where).toEqual({ status: 'OPEN' });
    await get('?status=MATCHED');
    expect(orderFindMany.mock.calls[1]?.[0].where).toEqual({ status: 'PENDING_REVIEW' });
  });
});
