import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRequestUser = vi.fn();
const loadAktualno = vi.fn();
const saveAktualno = vi.fn();
vi.mock('@specai/database', () => ({ HOUSE_COMPANY_ID: 'specplast16-house' }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));
vi.mock('@/lib/aktualnoData', () => ({
  HOUSE_NOT_ASKED: 'house',
  loadAktualno,
  saveAktualno,
}));

const { GET, PUT } = await import('./route');

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/aktualno', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
const items = [{ id: 'e1', hourlyRate: 3000, dailyRate: 24000, availability: { kind: 'today' } }];

describe('/api/aktualno', () => {
  beforeEach(() => {
    getRequestUser.mockReset();
    loadAktualno.mockReset().mockResolvedValue([]);
    saveAktualno.mockReset().mockResolvedValue({ ok: true, saved: 1 });
  });

  it('only a provider manager of a company other than the house fleet', async () => {
    getRequestUser.mockResolvedValue(null);
    expect((await GET(new NextRequest('http://localhost/api/aktualno'))).status).toBe(401);
    for (const user of [
      { id: 'u', role: 'CUSTOMER', companyId: null },
      { id: 'u', role: 'PROVIDER_OPERATOR', companyId: 'c1' },
      { id: 'u', role: 'PROVIDER_ADMIN', companyId: 'specplast16-house' },
    ]) {
      getRequestUser.mockResolvedValue(user);
      expect((await GET(new NextRequest('http://localhost/api/aktualno'))).status).toBe(403);
      expect((await put({ items })).status).toBe(403);
    }
    expect(loadAktualno).not.toHaveBeenCalled();
    expect(saveAktualno).not.toHaveBeenCalled();
  });

  it('loads and saves for the session’s own company, never one from the body', async () => {
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'c1' });
    await GET(new NextRequest('http://localhost/api/aktualno'));
    expect(loadAktualno).toHaveBeenCalledWith('c1');
    const response = await put({ items, companyId: 'c-other' });
    expect(response.status).toBe(200);
    expect(saveAktualno.mock.calls[0]?.[0]).toMatchObject({ companyId: 'c1' });
  });

  it('passes the save’s refusal on and refuses a broken body', async () => {
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'PROVIDER_ADMIN', companyId: 'c1' });
    saveAktualno.mockResolvedValue({ ok: false, status: 404, error: 'Техника не найдена' });
    expect((await put({ items })).status).toBe(404);
    expect((await put({ items: [] })).status).toBe(400);
  });
});
