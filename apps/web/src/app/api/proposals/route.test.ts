import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const create = vi.fn();
const notifyTelegram = vi.fn();
const getRequestUser = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { proposal: { create } } }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser }));

const { POST } = await import('./route');

let ip = 0;
function request(fields: Record<string, unknown> = {}, fromIp?: string) {
  ip += 1;
  return new NextRequest('http://localhost/api/proposals', {
    method: 'POST',
    headers: { 'x-forwarded-for': fromIp ?? `10.1.0.${ip}` },
    body: JSON.stringify({
      kind: 'PARTNERSHIP',
      name: 'Иван',
      contact: 'test@example.com',
      company: 'ООО Пример',
      message: 'Предлагаем совместную рекламу техники в нашем журнале.',
      consent: true,
      website: '',
      ...fields,
    }),
  });
}

describe('POST /api/proposals', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: 'p1' });
    notifyTelegram.mockReset().mockResolvedValue(true);
    getRequestUser.mockReset().mockResolvedValue(null);
  });

  it('saves a guest proposal, notifies the owner and answers without ids', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ ok: true, message: 'Спасибо! Мы прочитаем и ответим.' });
    expect(create.mock.calls[0]?.[0].data).toEqual({
      kind: 'PARTNERSHIP',
      name: 'Иван',
      contact: 'test@example.com',
      company: 'ООО Пример',
      message: 'Предлагаем совместную рекламу техники в нашем журнале.',
      userId: null,
    });
  });

  it('takes the account from the session, never from the body', async () => {
    getRequestUser.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', email: 'a@b.ru', name: 'А' });
    await POST(request({ userId: 'someone-else' }));
    expect(create.mock.calls[0]?.[0].data.userId).toBe('u1');
  });

  it('sends Telegram only the kind, name, contact and the message start', async () => {
    getRequestUser.mockResolvedValue({
      id: 'u-secret',
      role: 'CUSTOMER',
      email: 'x@y.ru',
      name: 'И',
    });
    await POST(request({}, '203.0.113.7'));
    const text = notifyTelegram.mock.calls[0]?.[0] as string;
    expect(text).toContain('Имя: Иван');
    expect(text).toContain('Контакт: test@example.com');
    expect(text).toContain('Предлагаем совместную рекламу');
    expect(text).not.toContain('u-secret');
    expect(text).not.toContain('x@y.ru');
    expect(text).not.toContain('203.0.113.7');
    expect(text).not.toContain('ООО Пример');
  });

  it('refuses invalid fields with Russian messages per field', async () => {
    const response = await POST(
      request({ name: '', contact: 'abc', message: 'мало', consent: false }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fields).toMatchObject({
      name: 'Как к вам обращаться?',
      consent: 'Нужно согласие на обработку персональных данных',
    });
    expect(body.fields.contact).toMatch(/телефон/);
    expect(body.fields.message).toMatch(/подробнее/);
    expect(body.error).toBe('Как к вам обращаться?');
    expect(create).not.toHaveBeenCalled();
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it('pretends success for the honeypot and saves nothing', async () => {
    const response = await POST(request({ website: 'http://spam.example' }));
    expect(response.status).toBe(201);
    expect(create).not.toHaveBeenCalled();
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it('allows 5 messages an hour from one IP, then 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await POST(request({}, '198.51.100.1'))).status).toBe(201);
    }
    const response = await POST(request({}, '198.51.100.1'));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/через час/);
    expect(create).toHaveBeenCalledTimes(5);
    // Another address is not affected.
    expect((await POST(request({}, '198.51.100.2'))).status).toBe(201);
  });

  it('limits one account across addresses too', async () => {
    getRequestUser.mockResolvedValue({
      id: 'u-limit',
      role: 'CUSTOMER',
      email: 'a@b.ru',
      name: 'А',
    });
    for (let i = 0; i < 5; i += 1) expect((await POST(request())).status).toBe(201);
    expect((await POST(request())).status).toBe(429);
  });

  it('still succeeds when only Telegram got it, fails when nothing did', async () => {
    create.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await POST(request())).status).toBe(201);
    notifyTelegram.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Не удалось отправить/);
  });
});
