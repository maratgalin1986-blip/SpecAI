import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const create = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { lead: { create } } }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));

const { POST } = await import('./route');

let ip = 0;
function request() {
  ip += 1;
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.0.0.${ip}` },
    body: JSON.stringify({ name: 'Иван', phone: '+79270000000', consent: true, website: '' }),
  });
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    create.mockReset();
    notifyTelegram.mockReset();
  });

  it('saves the lead and notifies the owner', async () => {
    create.mockResolvedValue({});
    notifyTelegram.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    expect(notifyTelegram.mock.calls[0]?.[0]).toContain('+79270000000');
    expect(notifyTelegram.mock.calls[0]?.[0]).toContain('Имя: Иван');
  });

  it('still delivers the lead to Telegram when the database is down', async () => {
    create.mockRejectedValue(new Error('db down'));
    notifyTelegram.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(202);
    const text = notifyTelegram.mock.calls[0]?.[0] as string;
    expect(text).toContain('база недоступна');
    expect(text).toContain('+79270000000');
    // Localisation: without the database the name stays off the messenger.
    expect(text).not.toContain('Иван');
  });

  it('tells the client to call when neither the database nor Telegram works', async () => {
    create.mockRejectedValue(new Error('db down'));
    notifyTelegram.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('Позвоните');
  });
});
