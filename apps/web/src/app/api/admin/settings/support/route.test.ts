import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn((args: unknown) => ({ op: 'upsert', args }));
const deleteMany = vi.fn((args: unknown) => ({ op: 'deleteMany', args }));
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('@specai/database', () => ({
  prisma: {
    appSetting: { findMany, upsert, deleteMany },
    $transaction: transaction,
  },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET, PUT } = await import('./route');

const TEST_CARD = '4111111111111111'; // the well-known test number

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api/admin/settings/support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
  );
}

describe('/api/admin/settings/support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockReturnValue(true);
    findMany.mockResolvedValue([]);
  });

  it('refuses without the admin session and touches nothing', async () => {
    isAdminRequest.mockReturnValue(false);
    const read = await GET();
    expect(read.status).toBe(401);
    const write = await put({ card: TEST_CARD, enabled: true });
    expect(write.status).toBe(401);
    expect((await write.json()).error).toBe('Нет доступа');
    expect(findMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('shows the stored settings to the admin', async () => {
    findMany.mockResolvedValue([
      { key: 'support.card', value: TEST_CARD, updatedAt: new Date('2026-10-17T09:00:00Z') },
      { key: 'support.enabled', value: '1', updatedAt: new Date('2026-10-17T09:00:00Z') },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).support).toEqual({
      card: TEST_CARD,
      cardFormatted: '4111 1111 1111 1111',
      recipient: '',
      enabled: true,
      updatedAt: '2026-10-17T09:00:00.000Z',
    });
    expect(findMany.mock.calls[0]?.[0].take).toBe(3);
  });

  it('rejects a mistyped card with 400 and saves nothing', async () => {
    for (const card of ['4111111111111112', '1234', '4111 1111 1111 111x']) {
      const response = await put({ card, enabled: true });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/номер карты/);
    }
    expect((await put('not json')).status).toBe(400);
    expect((await put({ card: '', enabled: true })).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores digits only, the name and the switch in one transaction', async () => {
    findMany.mockResolvedValue([
      { key: 'support.card', value: TEST_CARD },
      { key: 'support.recipient', value: 'Иван И.' },
      { key: 'support.enabled', value: '1' },
    ]);
    const response = await put({
      card: '4111 1111 1111 1111',
      recipient: '  Иван И. ',
      enabled: true,
    });
    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls.map(([args]) => (args as { create: unknown }).create)).toEqual([
      { key: 'support.card', value: TEST_CARD },
      { key: 'support.recipient', value: 'Иван И.' },
      { key: 'support.enabled', value: '1' },
    ]);
    expect((await response.json()).support.enabled).toBe(true);
  });

  it('clears the card and the name when they are emptied', async () => {
    const response = await put({ card: '', recipient: '', enabled: false });
    expect(response.status).toBe(200);
    expect(deleteMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { key: 'support.card' } },
      { where: { key: 'support.recipient' } },
    ]);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ create: { value: '0' } });
  });
});
