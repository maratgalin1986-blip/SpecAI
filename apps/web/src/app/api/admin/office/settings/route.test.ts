import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const upsert = vi.fn((args: unknown) => ({ op: 'upsert', args }));
const transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('@specai/database', () => ({
  prisma: { appSetting: { upsert }, $transaction: transaction },
}));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { PUT } = await import('./route');

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe('PUT /api/admin/office/settings — реквизиты для оплаты (S6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
  });

  it('refuses without the admin session (an async check is awaited)', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await put({ payDetails: 'ООО «Пример»' });
    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saves the pay details trimmed, an empty text clears them', async () => {
    expect((await put({ payDetails: '  ООО «Пример»\nр/с …  ' })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'office.payDetails' },
      update: { value: 'ООО «Пример»\nр/с …' },
      create: { key: 'office.payDetails', value: 'ООО «Пример»\nр/с …' },
    });
    upsert.mockClear();
    expect((await put({ payDetails: '   ' })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: '' },
        create: { key: 'office.payDetails', value: '' },
      }),
    );
  });

  it('rejects text longer than 2000 characters or not a string', async () => {
    for (const payDetails of ['я'.repeat(2001), 42]) {
      const response = await put({ payDetails });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Реквизиты/);
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/office/settings — ИИ-аналитик (U2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
  });

  it('saves the switch as 1/0 and the daily cap as an integer', async () => {
    expect((await put({ aiOffers: true, aiDailyCap: 40 })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'office.aiOffers' },
      update: { value: '1' },
      create: { key: 'office.aiOffers', value: '1' },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'office.aiDailyCap' },
      update: { value: '40' },
      create: { key: 'office.aiDailyCap', value: '40' },
    });
    upsert.mockClear();
    expect((await put({ aiOffers: false, aiDailyCap: 0 })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { key: 'office.aiOffers', value: '0' } }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { key: 'office.aiDailyCap', value: '0' } }),
    );
  });

  it('rejects a cap outside 0…500, a fraction and a switch that is not true/false', async () => {
    for (const body of [
      { aiDailyCap: 501 },
      { aiDailyCap: -1 },
      { aiDailyCap: 2.5 },
      { aiOffers: '1' },
    ]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/ИИ/);
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/office/settings — режим рассылки (К2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
  });

  it('saves «approve» or «auto»', async () => {
    for (const outreachMode of ['approve', 'auto']) {
      upsert.mockClear();
      expect((await put({ outreachMode })).status).toBe(200);
      expect(upsert).toHaveBeenCalledWith({
        where: { key: 'office.outreachMode' },
        update: { value: outreachMode },
        create: { key: 'office.outreachMode', value: outreachMode },
      });
    }
  });

  it('rejects anything else with a Russian message', async () => {
    const response = await put({ outreachMode: 'always' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Режим рассылки/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saves the VAT rate of the invoice from the allowed list, 0 included (К8)', async () => {
    for (const vatRate of [0, 5, 22]) {
      upsert.mockClear();
      expect((await put({ vatRate })).status).toBe(200);
      expect(upsert).toHaveBeenCalledWith({
        where: { key: 'office.vatRate' },
        update: { value: String(vatRate) },
        create: { key: 'office.vatRate', value: String(vatRate) },
      });
    }
    transaction.mockClear();
    for (const vatRate of [18, -5, 22.5, '22']) {
      const response = await put({ vatRate });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Ставка НДС/);
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});
