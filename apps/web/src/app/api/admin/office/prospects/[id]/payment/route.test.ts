import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { prospect: { findUnique, updateMany } } }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { POST } = await import('./route');

const ID = 'ckclient123';

/** По умолчанию клиент видел «не оплачено» (expectedPaidUntil: null), как строка в findUnique. */
function post(body: unknown, id = ID) {
  if (body && typeof body === 'object' && !('expectedPaidUntil' in body)) {
    body = { expectedPaidUntil: null, ...body };
  }
  return raw(body, id);
}

function raw(body: unknown, id = ID) {
  return POST(
    new Request(`http://localhost/api/admin/office/prospects/${id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) },
  );
}

describe('POST /api/admin/office/prospects/[id]/payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    isAdminRequest.mockResolvedValue(true);
    findUnique.mockResolvedValue({ id: ID, kind: 'site', status: 'PUBLISHED', paidUntil: null });
    updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses without the admin session (an async check is awaited) and touches nothing', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await post({ action: 'setup' });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Нет доступа');
    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('marks the site paid and opens a month, guarded by the row it read', async () => {
    const response = await post({ action: 'setup', setupPrice: 12000, monthlyPrice: null });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, paidUntil: '2026-12-09T12:00:00.000Z' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: ID, kind: 'site', status: { in: ['AGREED', 'PUBLISHED'] }, paidUntil: null },
      data: {
        setupPaidAt: new Date('2026-11-09T12:00:00Z'),
        paidUntil: new Date('2026-12-09T12:00:00Z'),
        setupPrice: 12000,
        monthlyPrice: null,
      },
    });
  });

  it('extends a running period by 12 months', async () => {
    const current = new Date('2027-01-15T09:00:00Z');
    findUnique.mockResolvedValue({ id: ID, kind: 'site', status: 'PUBLISHED', paidUntil: current });
    const response = await post({ action: 'year', expectedPaidUntil: current.toISOString() });
    expect(await response.json()).toEqual({ ok: true, paidUntil: '2028-01-15T09:00:00.000Z' });
    expect(updateMany.mock.calls[0]![0].where.paidUntil).toEqual(current);
  });

  it('undo clears both marks', async () => {
    findUnique.mockResolvedValue({
      id: ID,
      kind: 'site',
      status: 'PUBLISHED',
      paidUntil: new Date('2027-01-15T09:00:00Z'),
    });
    const response = await post({ action: 'undo', expectedPaidUntil: '2027-01-15T09:00:00.000Z' });
    expect(await response.json()).toEqual({ ok: true, paidUntil: null });
    expect(updateMany.mock.calls[0]![0].data).toEqual({ setupPaidAt: null, paidUntil: null });
  });

  it('saves only the prices with «prices» and refuses an empty one', async () => {
    const ok = await post({ action: 'prices', monthlyPrice: 0 });
    expect(ok.status).toBe(200);
    expect(updateMany.mock.calls[0]![0].data).toEqual({ monthlyPrice: 0 });
    const empty = await post({ action: 'prices' });
    expect(empty.status).toBe(400);
  });

  it('rejects bad input in Russian', async () => {
    for (const body of [
      { action: 'refund' },
      { action: 'month', setupPrice: -1 },
      { action: 'month', monthlyPrice: 1.5 },
      { action: 'month', monthlyPrice: 1_000_001 },
      'not json',
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/[А-Яа-яЁё]/);
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is 404 for a bad id, a missing row or a provider; 409 for a site not agreed', async () => {
    expect((await post({ action: 'month' }, '../x')).status).toBe(404);
    findUnique.mockResolvedValueOnce(null);
    expect((await post({ action: 'month' })).status).toBe(404);
    findUnique.mockResolvedValueOnce({
      id: ID,
      kind: 'provider',
      status: 'PUBLISHED',
      paidUntil: null,
    });
    expect((await post({ action: 'month' })).status).toBe(404);
    findUnique.mockResolvedValueOnce({
      id: ID,
      kind: 'site',
      status: 'CONTACTED',
      paidUntil: null,
    });
    expect((await post({ action: 'month' })).status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is 409 when the row changed in between (a double click does not double the months)', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const response = await post({ action: 'month' });
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain(ID);
  });

  it('requires the paidUntil the owner saw, with a Russian error', async () => {
    for (const body of [
      { action: 'month' },
      { action: 'month', expectedPaidUntil: 'вчера' },
      { action: 'month', expectedPaidUntil: 5 },
    ]) {
      const response = await raw(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('оплачено до');
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a repeated «+1 month» with the same expected value gets 409, not a second month', async () => {
    let stored: Date | null = new Date('2026-12-01T09:00:00Z');
    findUnique.mockImplementation(async () => ({
      id: ID,
      kind: 'site',
      status: 'PUBLISHED',
      paidUntil: stored,
    }));
    updateMany.mockImplementation(
      async (args: { where: { paidUntil: Date | null }; data: { paidUntil?: Date } }) => {
        if ((args.where.paidUntil?.getTime() ?? null) !== (stored?.getTime() ?? null)) {
          return { count: 0 };
        }
        if (args.data.paidUntil !== undefined) stored = args.data.paidUntil;
        return { count: 1 };
      },
    );
    const body = { action: 'month', expectedPaidUntil: '2026-12-01T09:00:00.000Z' };
    const first = await post(body);
    expect(await first.json()).toEqual({ ok: true, paidUntil: '2027-01-01T09:00:00.000Z' });
    const second = await post(body);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('Дата оплаты уже изменилась — обновите страницу');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(stored).toEqual(new Date('2027-01-01T09:00:00Z'));
  });
});
