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
const loadReviewLinks = vi.fn();
vi.mock('@/lib/reviewLinks', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/reviewLinks')>()),
  loadReviewLinks,
}));
const ensureReferralCode = vi.fn();
vi.mock('@/lib/referralStore', () => ({ ensureReferralCode }));

const { PATCH } = await import('./route');
const { notifyUser, notifyCompany } = await import('@/lib/notifications/notifyUser');

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

describe('PATCH /api/bookings/[id] — after a completed booking', () => {
  const past = new Date(Date.now() - 86_400_000);
  const done = (status: string) => ({ ...booking(status), startDate: past, endDate: past });

  beforeEach(() => {
    vi.mocked(notifyUser).mockReset();
    vi.mocked(notifyCompany).mockReset();
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockReset();
    loadReviewLinks.mockReset();
    loadReviewLinks.mockResolvedValue({
      twoGis: 'https://2gis.ru/kazan/firm/1',
      yandex: '',
      updatedAt: null,
    });
    ensureReferralCode.mockReset();
    ensureReferralCode.mockResolvedValue('ABCDEFG');
    getRequestUser.mockReset();
    getRequestUser.mockResolvedValue({ id: 'prov', role: 'PROVIDER_ADMIN', companyId: 'c1' });
  });

  it('the customer hears once: rate, the 2ГИС card and the invitation, in the status message', async () => {
    findUnique.mockResolvedValue(done('ACTIVE'));
    findUniqueOrThrow.mockResolvedValue(done('COMPLETED'));
    expect((await patch('COMPLETED')).status).toBe(200);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [userId, event, options] = vi.mocked(notifyUser).mock.calls[0]!;
    expect(userId).toBe('cust');
    const followUp = (event as { followUp?: string[] }).followUp ?? [];
    expect(followUp.join('\n')).toContain('Оцените исполнителя');
    expect(followUp.join('\n')).toContain('2ГИС — https://2gis.ru/kazan/firm/1');
    expect(followUp.join('\n')).not.toContain('Яндекс Карты');
    expect(followUp.join('\n')).toMatch(/Пригласите коллегу.*\/r\/ABCDEFG/);
    expect(options?.email?.text).toContain('Пригласите коллегу');
    expect(ensureReferralCode).toHaveBeenCalledWith('cust');
    expect(notifyCompany).not.toHaveBeenCalled();
  });

  it('a second click finds the status changed and sends nothing', async () => {
    findUnique.mockResolvedValue(done('ACTIVE'));
    updateMany.mockResolvedValue({ count: 0 });
    expect((await patch('COMPLETED')).status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(done('COMPLETED'));
    expect((await patch('COMPLETED')).status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('other moves carry no follow-up', async () => {
    findUnique.mockResolvedValue(booking('PENDING'));
    findUniqueOrThrow.mockResolvedValue(booking('CONFIRMED'));
    await patch('CONFIRMED');
    const [, event] = vi.mocked(notifyUser).mock.calls[0]!;
    expect((event as { followUp?: string[] }).followUp).toBeUndefined();
    expect(loadReviewLinks).not.toHaveBeenCalled();
  });

  it('a failure to read the links or the code keeps the status change and the thanks', async () => {
    loadReviewLinks.mockRejectedValue(new Error('db down'));
    ensureReferralCode.mockRejectedValue(new Error('db down'));
    findUnique.mockResolvedValue(done('ACTIVE'));
    findUniqueOrThrow.mockResolvedValue(done('COMPLETED'));
    expect((await patch('COMPLETED')).status).toBe(200);
    const [, event] = vi.mocked(notifyUser).mock.calls[0]!;
    const followUp = (event as { followUp?: string[] }).followUp ?? [];
    expect(followUp).toHaveLength(2);
    expect(followUp[1]).toContain('Оцените исполнителя');
  });
});
