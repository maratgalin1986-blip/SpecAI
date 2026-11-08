import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn();
const orderUpdateMany = vi.fn();
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const bidUpdateMany = vi.fn();
const tx = {
  order: { updateMany: orderUpdateMany, findUnique: orderFindUnique, update: orderUpdate },
  bid: { updateMany: bidUpdateMany },
};
vi.mock('@specai/database', () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    order: { findUnique: orderFindUnique },
  },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
const notifyProvidersAboutOrder = vi.fn();
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyProvidersAboutOrder }));
vi.mock('@specai/ai-service', () => ({
  moderateChatOrder: vi.fn(),
  ModerationOutputError: class extends Error {},
}));

const { PATCH } = await import('./route');

async function patch(status: string) {
  const response = await PATCH(
    new NextRequest('http://localhost/api/admin/orders/o1', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    { params: { id: 'o1' } },
  );
  return { status: response.status, body: await response.json() };
}

describe('PATCH /api/admin/orders/[id]: the admin overrides moderation', () => {
  beforeEach(() => {
    for (const mock of [
      isAdminRequest,
      orderUpdateMany,
      orderFindUnique,
      orderUpdate,
      bidUpdateMany,
      notifyProvidersAboutOrder,
    ]) {
      mock.mockReset();
    }
    isAdminRequest.mockReturnValue(true);
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderFindUnique.mockResolvedValue({
      desiredStartDate: new Date(Date.now() + 3 * 86_400_000),
      bidsUntil: new Date(Date.now() + 3_600_000),
    });
  });

  it('marks a publication as the admin decision and tells the providers', async () => {
    const { status } = await patch('OPEN');
    expect(status).toBe(200);
    const query = orderUpdateMany.mock.calls[0]?.[0];
    expect(query.data).toMatchObject({ status: 'OPEN', moderatedBy: 'admin' });
    expect(query.data.moderatedAt).toBeInstanceOf(Date);
    // From moderation, or an order the AI rejected (not an erased one, with
    // a machinery type and dates still ahead).
    expect(query.where.id).toBe('o1');
    expect(query.where.OR[0]).toEqual({ status: { in: ['PENDING_REVIEW'] } });
    expect(query.where.OR[1]).toMatchObject({
      status: 'CANCELLED',
      moderatedBy: 'ai',
      moderationDecision: 'REJECT',
      rawText: { not: null },
      categoryId: { not: null },
    });
    expect(query.where.OR[1].desiredEndDate.gte).toBeInstanceOf(Date);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(notifyProvidersAboutOrder).toHaveBeenCalledWith('o1');
  });

  it('gives a republished order a fresh bid window', async () => {
    orderFindUnique.mockResolvedValue({
      desiredStartDate: new Date(Date.now() + 3 * 86_400_000),
      bidsUntil: new Date(Date.now() - 86_400_000),
    });
    expect((await patch('OPEN')).status).toBe(200);
    const bidsUntil = orderUpdate.mock.calls[0]?.[0].data.bidsUntil as Date;
    expect(bidsUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('withdraws an AI publication as the admin, rejecting pending bids', async () => {
    const { status } = await patch('CANCELLED');
    expect(status).toBe(200);
    const query = orderUpdateMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({
      id: 'o1',
      OR: [{ status: { in: ['PENDING_REVIEW', 'OPEN'] } }],
    });
    expect(query.data).toMatchObject({ status: 'CANCELLED', moderatedBy: 'admin' });
    expect(bidUpdateMany).toHaveBeenCalled();
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('answers 409 when the order cannot move any more', async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
    orderFindUnique.mockResolvedValue({ status: 'MATCHED' });
    const { status, body } = await patch('OPEN');
    expect(status).toBe(409);
    expect(body.status).toBe('MATCHED');
  });

  it('refuses without the admin session', async () => {
    isAdminRequest.mockReturnValue(false);
    expect((await patch('OPEN')).status).toBe(401);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });
});
