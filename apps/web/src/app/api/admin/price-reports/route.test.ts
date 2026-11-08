import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const isAdminRequest = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { priceReport: { findMany } } }));
vi.mock('@/lib/admin', () => ({ isAdminRequest }));

const { GET } = await import('./route');

describe('GET /api/admin/price-reports', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([
      {
        id: 'r1',
        categorySlug: 'excavators',
        city: 'Казань',
        region: 'Республика Татарстан',
        hourlyRate: 3500,
        companyName: 'ООО Ромашка',
        contactName: 'Иван',
        phone: '+79000000000',
        wantsOrders: true,
        consentAt: new Date('2026-10-18T09:00:00Z'),
        source: 'web',
        createdAt: new Date('2026-10-18T09:00:00Z'),
      },
    ]);
    isAdminRequest.mockReset();
  });

  it('is for the admin only', async () => {
    isAdminRequest.mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('gives the admin a CSV download without the reporter hash', async () => {
    isAdminRequest.mockReturnValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="opros-cen-/);
    const text = await response.text();
    expect(text).toContain('"Иван"');
    expect(findMany.mock.calls[0]?.[0].select.reporterHash).toBeUndefined();
    expect(findMany.mock.calls[0]?.[0].take).toBeGreaterThan(0);
  });
});
