import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Stored answers and published machines of other providers, in memory.
interface Row {
  id: string;
  categorySlug: string;
  city: string;
  region: string | null;
  hourlyRate: number;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  reporterHash: string | null;
  networkHash?: string | null;
  createdAt: Date;
}
let reports: Row[] = [];
let machines: unknown[] = [];
const create = vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
  const row = { ...data, id: `r${reports.length + 1}`, createdAt: new Date() };
  reports.unshift(row);
  return { id: row.id, createdAt: row.createdAt };
});
const count = vi.fn(
  async ({ where }: { where: { reporterHash: string; createdAt: { gte: Date } } }) =>
    reports.filter(
      (row) =>
        row.reporterHash === where.reporterHash &&
        row.createdAt.getTime() >= where.createdAt.gte.getTime(),
    ).length,
);
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({
  HOUSE_COMPANY_ID: 'specplast16-house',
  prisma: {
    priceReport: { create, count, findMany: vi.fn(async () => reports) },
    equipment: { findMany: vi.fn(async () => machines) },
  },
}));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { POST } = await import('./route');
const { resetPriceIndexMemo } = await import('@/lib/priceIndexData');

let ip = 0;
function request(fields: Record<string, unknown> = {}, fromIp?: string) {
  ip += 1;
  return new NextRequest('http://localhost/api/ceny/opros', {
    method: 'POST',
    headers: { 'x-forwarded-for': fromIp ?? `10.2.0.${ip}` },
    body: JSON.stringify({
      categorySlug: 'excavators',
      city: 'Казань',
      hourlyRate: 3500,
      ...fields,
    }),
  });
}

/** A published machine of another provider company in Казань. */
const machine = (companyId: string, hourlyRate: number) => ({
  companyId,
  hourlyRate,
  dailyRate: hourlyRate * 8,
  category: { slug: 'excavators' },
  company: {
    baseLat: 55.79,
    baseLon: 49.12,
    baseAddress: 'Казань, ул. Секретная 7, тел. +7 999 111-22-33',
  },
  location: null,
});

beforeEach(() => {
  reports = [];
  machines = [];
  create.mockClear();
  getRequestUser.mockReset().mockResolvedValue(null);
  process.env.NEXTAUTH_SECRET = 'test-secret';
  resetPriceIndexMemo();
});

describe('POST /api/ceny/opros', () => {
  it('saves the answer and shows back only the aggregate, never anyone’s data', async () => {
    machines = [machine('c-alpha', 3000), machine('c-beta', 4000), machine('c-gamma', 5000)];
    reports = [
      {
        id: 'old',
        categorySlug: 'excavators',
        city: 'Казань',
        region: 'Республика Татарстан',
        hourlyRate: 4200,
        companyName: 'ООО Тайна',
        contactName: 'Пётр Секретов',
        phone: '+79990001122',
        reporterHash: 'someone-else',
        createdAt: new Date(),
      },
    ];
    const response = await POST(request());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.index).toEqual({
      scope: 'city',
      place: 'Казань',
      // Four reporters: the median only, no range that would give single prices away.
      cell: { median: 4100, min: null, max: null, reporters: 4 },
    });
    expect(body.text).toContain('Казань');
    const raw = JSON.stringify(body);
    for (const secret of [
      'c-alpha',
      'Тайна',
      'Секретов',
      '79990001122',
      'someone-else',
      'r1',
      'Секретная',
      '111-22-33',
    ]) {
      expect(raw).not.toContain(secret);
    }
    // Only these keys: no ids of the saved row, no reporter hash.
    expect(Object.keys(body).sort()).toEqual(['index', 'ok', 'text', 'wantsOrders']);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      categorySlug: 'excavators',
      city: 'Казань',
      region: 'Республика Татарстан',
      hourlyRate: 3500,
      source: 'web',
      contactName: null,
      phone: null,
      consentAt: null,
    });
  });

  it('too few others: «вы среди первых», no number', async () => {
    machines = [machine('c-alpha', 3000), machine('c-beta', 4000)];
    const body = await (await POST(request())).json();
    expect(body.index).toBeNull();
    expect(body.text).toContain('вы среди первых');
  });

  it('refuses a name or phone without consent, and a typo price', async () => {
    const noConsent = await POST(request({ contactName: 'Иван', phone: '+7 900 000-00-00' }));
    expect(noConsent.status).toBe(400);
    expect((await noConsent.json()).error).toContain('согласие');
    expect((await POST(request({ hourlyRate: 3 }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    const consented = await POST(request({ contactName: 'Иван', consent: true }));
    expect(consented.status).toBe(201);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ contactName: 'Иван' });
  });

  it('limits answers per address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await POST(request({}, '10.9.9.9'))).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });

  it('limits answers per reporter in the database too (all server instances)', async () => {
    getRequestUser.mockResolvedValue({ id: 'u-db', role: 'CUSTOMER', companyId: null });
    // Five answers already stored for this account an hour ago at most.
    const first = await POST(request({}, '10.8.0.1'));
    expect(first.status).toBe(201);
    const hash = create.mock.calls[0]![0].data.reporterHash as string;
    for (let i = 0; i < 4; i += 1) {
      reports.push({ ...reports[0]!, id: `x${i}`, reporterHash: hash });
    }
    const limited = await POST(request({}, '10.8.0.2'));
    expect(limited.status).toBe(429);
  });

  it('a signed-in provider counts as his company, never twice', async () => {
    getRequestUser.mockResolvedValue({ id: 'u-a', role: 'PROVIDER_ADMIN', companyId: 'c-alpha' });
    machines = [machine('c-alpha', 3000), machine('c-beta', 4000)];
    await POST(request({}, '10.7.0.1'));
    const { companyReporter } = await import('@/lib/reporterHash');
    const stored = create.mock.calls[0]?.[0].data.reporterHash as string;
    expect(stored).toBe(companyReporter('c-alpha'));
    // A keyed hash: the company id itself is not in the row.
    expect(stored).not.toContain('c-alpha');
    // In the public index the company and its answer are one reporter: two companies, no number.
    resetPriceIndexMemo();
    const { lookupPrice } = await import('@/lib/priceIndex');
    const { loadPriceIndex } = await import('@/lib/priceIndexData');
    const { points } = await loadPriceIndex();
    expect(lookupPrice(points, 'excavators', { city: 'Казань' })).toBeNull();
  });

  it('guests are limited by address but count in the index once per network', async () => {
    await POST(request({}, '10.6.0.1'));
    await POST(request({}, '10.6.0.2'));
    const [first, second] = create.mock.calls.map((call) => call[0].data) as [Row, Row];
    // Different addresses: separate limits (a carrier's NAT does not block everyone).
    expect(first.reporterHash).not.toBe(second.reporterHash);
    // One network: one participant of the index.
    expect(first.networkHash).toBe(second.networkHash);
    expect(first.networkHash).toMatch(/^n:/);
    // Two guests of one network and one company: two reporters, no number.
    machines = [machine('c-alpha', 3000)];
    resetPriceIndexMemo();
    const { lookupPrice } = await import('@/lib/priceIndex');
    const { loadPriceIndex } = await import('@/lib/priceIndexData');
    const { points } = await loadPriceIndex();
    expect(lookupPrice(points, 'excavators', { city: 'Казань' })).toBeNull();
  });

  it('a bot filling the hidden field gets a quiet success and nothing is saved', async () => {
    const response = await POST(request({ website: 'spam.example' }));
    expect(response.status).toBe(201);
    expect(create).not.toHaveBeenCalled();
  });
});
