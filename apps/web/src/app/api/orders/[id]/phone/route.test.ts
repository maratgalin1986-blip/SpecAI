import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const orderFindUnique = vi.fn();
const userFindUnique = vi.fn();
const companyFindUnique = vi.fn();
const revealFindFirst = vi.fn();
const revealFindMany = vi.fn();
const revealCount = vi.fn();
const revealCreate = vi.fn();
const getRequestUser = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: {
    order: { findUnique: orderFindUnique },
    user: { findUnique: userFindUnique },
    company: { findUnique: companyFindUnique },
    contactReveal: {
      findFirst: revealFindFirst,
      findMany: revealFindMany,
      count: revealCount,
      create: revealCreate,
    },
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/email', () => ({ isEmailConfigured: () => false }));

const { POST } = await import('./route');

const PROVIDER = { id: 'u1', name: 'Иван', role: 'PROVIDER_ADMIN', companyId: 'c1' };
const ORDER = {
  id: 'o1',
  source: 'TELEGRAM',
  status: 'OPEN',
  contactPhone: '+79171234567',
  contactName: 'Автор',
};
const OLD_VERIFIED = {
  name: 'ООО Ромашка',
  verified: true,
  createdAt: new Date(Date.now() - 60 * 24 * 60 * 60_000),
};
const orders = (n: number) => Array.from({ length: n }, (_, i) => ({ orderId: `o${i}` }));

let call = 0;
async function post() {
  call += 1;
  const response = await POST(new NextRequest(`http://localhost/api/orders/o${call}/phone`), {
    params: { id: `o${call}` },
  });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/orders/[id]/phone: limits against phone harvesting', () => {
  beforeEach(() => {
    getRequestUser.mockReset().mockResolvedValue({ ...PROVIDER, id: `u${call}` });
    orderFindUnique.mockReset().mockResolvedValue(ORDER);
    userFindUnique.mockReset().mockResolvedValue({ emailVerified: new Date() });
    companyFindUnique.mockReset().mockResolvedValue(OLD_VERIFIED);
    revealFindFirst.mockReset().mockResolvedValue(null);
    revealFindMany.mockReset().mockResolvedValue([]);
    revealCount.mockReset().mockResolvedValue(0);
    revealCreate.mockReset().mockResolvedValue({});
    notifyTelegram.mockReset().mockResolvedValue(true);
  });

  it('opens the phone to a verified company and logs it', async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body.phone).toBe('+79171234567');
    expect(revealCreate).toHaveBeenCalledOnce();
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it('gives a company younger than a week only 5 a day', async () => {
    companyFindUnique.mockResolvedValue({ ...OLD_VERIFIED, createdAt: new Date() });
    revealFindMany.mockResolvedValue(orders(5));
    const { status, body } = await post();
    expect(status).toBe(429);
    expect(body.error).toContain('5 телефонов');
    expect(revealCreate).not.toHaveBeenCalled();
  });

  it('gives an unverified company only 5 a day', async () => {
    companyFindUnique.mockResolvedValue({ ...OLD_VERIFIED, verified: false });
    revealFindMany.mockResolvedValue(orders(5));
    expect((await post()).status).toBe(429);
  });

  it('stops one person at the per-user limit even when the company has share left', async () => {
    // Company today: 3 orders; this user today: 15.
    revealFindMany.mockResolvedValueOnce(orders(3)).mockResolvedValueOnce(orders(15));
    const { status, body } = await post();
    expect(status).toBe(429);
    expect(body.error).toContain('на сотрудника');
  });

  it('alerts the owner when the company passes 10 reveals in an hour', async () => {
    revealCount.mockResolvedValue(10);
    const { status } = await post();
    expect(status).toBe(200);
    expect(notifyTelegram).toHaveBeenCalledOnce();
    const text = String(notifyTelegram.mock.calls[0]?.[0]);
    expect(text).toContain('ООО Ромашка');
    expect(text).not.toContain('9171234567');
  });
});
