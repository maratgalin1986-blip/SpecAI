import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const sendOutreach = vi.fn();
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
vi.mock('@/lib/office/outreachRun', () => ({ sendOutreach }));

const { POST } = await import('./route');

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/office/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe('POST /api/admin/office/outreach — письма дня (К2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
    sendOutreach.mockResolvedValue({
      email: 2,
      whatsapp: 1,
      followUps: 1,
      skipped: null,
      errors: 0,
    });
  });

  it('refuses without the admin session', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await post({ send: true, ids: ['a'], exclude: [] });
    expect(response.status).toBe(401);
    expect(sendOutreach).not.toHaveBeenCalled();
  });

  it('sends only the shown letters without the excluded ones; the answer is numbers only', async () => {
    const response = await post({ send: true, ids: ['a', 'b', 'c', 'a'], exclude: ['b'] });
    expect(response.status).toBe(200);
    expect(sendOutreach).toHaveBeenCalledWith(expect.any(Date), {
      budgetMs: expect.any(Number),
      onlyApproved: ['a', 'c'],
    });
    expect(await response.json()).toEqual({
      ok: true,
      email: 2,
      whatsapp: 1,
      followUps: 1,
      errors: 0,
      optedOut: 0,
      noSmtp: false,
    });
  });

  it('without the button flag or with nothing left — 400, nothing is sent', async () => {
    for (const body of [
      { ids: ['a'] },
      { send: true, ids: ['a'], exclude: ['a'] },
      { send: true },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(typeof (await response.json()).error).toBe('string');
    }
    expect(sendOutreach).not.toHaveBeenCalled();
  });

  it('paused — 409 with a Russian reason; no SMTP is reported as a flag', async () => {
    sendOutreach.mockResolvedValueOnce({ email: 0, whatsapp: 0, skipped: 'paused', errors: 0 });
    expect((await post({ send: true, ids: ['a'] })).status).toBe(409);
    sendOutreach.mockResolvedValueOnce({
      email: 0,
      whatsapp: 0,
      skipped: null,
      errors: 0,
      mail: 'no-smtp',
    });
    const response = await post({ send: true, ids: ['a'] });
    expect((await response.json()).noSmtp).toBe(true);
  });
});
