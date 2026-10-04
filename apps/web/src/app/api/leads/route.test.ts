import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const create = vi.fn();
const findMany = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { lead: { create, findMany } } }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));

const { POST } = await import('./route');

let ip = 0;
function request(fields: Record<string, unknown> = { name: 'Иван' }) {
  ip += 1;
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.0.0.${ip}` },
    body: JSON.stringify({ phone: '+79270000000', consent: true, website: '', ...fields }),
  });
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    create.mockReset();
    findMany.mockReset().mockResolvedValue([]);
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

  it('accepts a lead without a name: only the phone and the consent are required', async () => {
    create.mockResolvedValue({});
    notifyTelegram.mockResolvedValue(true);
    for (const fields of [{}, { name: '' }, { name: '   ' }]) {
      create.mockClear();
      const response = await POST(request(fields));
      expect(response.status).toBe(201);
      expect(create.mock.calls[0]?.[0].data.name).toBe('Имя не указано');
    }
  });

  it('still refuses a lead without the consent', async () => {
    const response = await POST(request({ consent: false }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
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

  it('refuses a 4th lead from the same phone in 10 minutes, from any IP', async () => {
    const recent = new Date();
    findMany.mockResolvedValue([
      { phone: '8 927 000-00-00', createdAt: recent },
      { phone: '+7 927 000-00-00', createdAt: recent },
      { phone: '+79270000000', createdAt: recent },
    ]);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain('+7 (927) 242-80-88');
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { phone: { endsWith: '00' } } });
    expect(create).not.toHaveBeenCalled();
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it('tells the client to call when neither the database nor Telegram works', async () => {
    create.mockRejectedValue(new Error('db down'));
    notifyTelegram.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('Позвоните');
  });
});
