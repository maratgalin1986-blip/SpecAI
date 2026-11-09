import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const update = vi.fn(async () => ({}));
vi.mock('@specai/database', () => ({ prisma: { prospect: { findUnique, update } } }));

vi.stubEnv('CRON_SECRET', 'route-secret');

const { POST, GET } = await import('./route');
const { unsubscribeSignature } = await import('@/lib/office/unsubscribe');
const { NextRequest } = await import('next/server');

const TOKEN = 'abcdef0123456789abcdef0123456789';

function post(url: string, init: { headers?: Record<string, string>; body?: string } = {}) {
  return POST(new NextRequest(url, { method: 'POST', ...init }));
}

describe('POST /api/office/unsubscribe (К3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: 'p1', status: 'CONTACTED', optOutAt: null });
  });

  it('one-click from a mail client: t and s in the address — opted out, answer without data', async () => {
    const s = unsubscribeSignature(TOKEN)!;
    const response = await post(
      `http://localhost/api/office/unsubscribe?t=${TOKEN}&s=${encodeURIComponent(s)}`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toMatch(/p1|@|\+7/);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'DECLINED', optOutAt: expect.any(Date) }),
    });
  });

  it('the page button: { t, s } in a JSON body', async () => {
    const response = await post('http://localhost/api/office/unsubscribe', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: TOKEN, s: unsubscribeSignature(TOKEN) }),
    });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('a forged or missing signature changes nothing', async () => {
    for (const s of ['', 'forged']) {
      const response = await post(`http://localhost/api/office/unsubscribe?t=${TOKEN}&s=${s}`);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/недействительна/);
    }
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('an unknown token with a valid signature is still a success (data already deleted)', async () => {
    findUnique.mockResolvedValue(null);
    const s = unsubscribeSignature(TOKEN)!;
    const response = await post(
      `http://localhost/api/office/unsubscribe?t=${TOKEN}&s=${encodeURIComponent(s)}`,
    );
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('GET /api/office/unsubscribe', () => {
  it('never opts out, only leads to the confirm page', async () => {
    const response = GET(
      new NextRequest(`http://localhost/api/office/unsubscribe?t=${TOKEN}&s=abc`),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`http://localhost/otpiska/${TOKEN}?s=abc`);
    expect(update).not.toHaveBeenCalled();
  });
});
