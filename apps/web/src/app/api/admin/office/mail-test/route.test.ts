import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequest = vi.fn();
const sendOfficeTestMail = vi.fn();
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
vi.mock('@/lib/office/smtp', () => ({
  SMTP_TIMEOUT_MS: 8_000,
  sendOfficeTestMail,
  officeMailConfig: () => ({
    user: 'office@example.ru',
    pass: 'app-pass-123',
    from: 'ИИСтройка24 <office@example.ru>',
  }),
}));

const { POST } = await import('./route');

async function failWith(reason: string) {
  sendOfficeTestMail.mockResolvedValue({ ok: false, reason });
  const response = await POST();
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /api/admin/office/mail-test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
  });

  it('без админа — 401 и письмо не уходит', async () => {
    isAdminRequest.mockResolvedValue(false);
    const response = await POST();
    expect(response.status).toBe(401);
    expect(sendOfficeTestMail).not.toHaveBeenCalled();
  });

  it('письмо ушло — только { ok: true }', async () => {
    sendOfficeTestMail.mockResolvedValue({ ok: true });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('ящик не настроен — названы переменные', async () => {
    const { status, body } = await failWith('no-smtp');
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('OUTREACH_SMTP_USER');
    expect(body.error).toContain('OUTREACH_SMTP_PASS');
  });

  it.each([
    'Invalid login: 535 5.7.8 Error: authentication failed',
    '535 Authentication failed',
    'EAUTH',
  ])('сервер не принял пароль: %s', async (reason) => {
    const { status, body } = await failWith(reason);
    expect(status).toBe(502);
    expect(body.error).toBe('Яндекс не принял пароль: нужен пароль приложения, не пароль от почты');
  });

  it.each(['Connection timeout', 'Greeting never received', 'connect ETIMEDOUT 1.2.3.4:465'])(
    'сервер молчит: %s',
    async (reason) => {
      const { body } = await failWith(reason);
      expect(body.error).toBe('Почтовый сервер не ответил за 8 с');
    },
  );

  it('другая причина — текст сервера не длиннее 200 знаков', async () => {
    const { body } = await failWith(`554 5.7.1 Message rejected ${'x'.repeat(400)}`);
    expect(String(body.error).startsWith('554 5.7.1 Message rejected')).toBe(true);
    expect(String(body.error).length).toBe(200);
  });

  it('адрес ящика и пароль в ответ не попадают', async () => {
    const { body } = await failWith(
      '550 Sender <office@example.ru> rejected, pass app-pass-123, rcpt other@firm.ru',
    );
    const json = JSON.stringify(body);
    expect(json).not.toContain('office@example.ru');
    expect(json).not.toContain('app-pass-123');
    expect(json).not.toContain('@');
    expect(json).toContain('550 Sender');
  });
});
