import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const create = vi.fn();
const notifyTelegram = vi.fn();
const runAgent = vi.fn();
const routeToAgent = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { lead: { create } } }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/requestUser', () => ({ getRequestUser: vi.fn().mockResolvedValue(null) }));
vi.mock('@specai/ai-service', () => ({ runAgent, routeToAgent }));

const { POST } = await import('./route');

let ip = 0;
function request(body: object) {
  ip += 1;
  return new NextRequest('http://localhost/api/ai/agents', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.1.0.${ip}` },
    body: JSON.stringify({ agentId: 'auto', ...body }),
  });
}
const phoneMessage = [{ role: 'user', content: 'Нужен автокран, 8 900 000-00-00' }];

describe('POST /api/ai/agents — a phone in the chat', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    create.mockReset().mockResolvedValue({});
    notifyTelegram.mockReset().mockResolvedValue(true);
    runAgent.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('asks for consent and saves nothing without it', async () => {
    const data = await (await POST(request({ messages: phoneMessage }))).json();
    expect(data.needConsent).toBe(true);
    expect(data.phone).toBe('+79000000000');
    expect(create).not.toHaveBeenCalled();
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('saves the lead before any AI call, even with an AI key', async () => {
    const data = await (await POST(request({ messages: phoneMessage, consent: true }))).json();
    expect(data.lead).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: '+79000000000', source: 'agents-chat' }),
    });
    expect(notifyTelegram).toHaveBeenCalledOnce();
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('sends only the phone to Telegram when the database is down', async () => {
    create.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await (await POST(request({ messages: phoneMessage, consent: true }))).json();
    expect(data.lead).toBe(true);
    const text = notifyTelegram.mock.calls[0]?.[0] as string;
    expect(text).toContain('+79000000000');
    expect(text).not.toContain('автокран');
  });

  it('asks to call when the lead reached nobody', async () => {
    create.mockRejectedValue(new Error('db down'));
    notifyTelegram.mockResolvedValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await (await POST(request({ messages: phoneMessage, consent: true }))).json();
    expect(data.lead).toBeUndefined();
    expect(data.reply).toContain('Позвоните');
  });
});

describe('POST /api/ai/agents — privacy and limits', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    create.mockReset().mockResolvedValue({});
    notifyTelegram.mockReset().mockResolvedValue(true);
    routeToAgent.mockReset().mockResolvedValue('consultant');
    runAgent.mockReset().mockResolvedValue({ agentId: 'consultant', reply: 'ok', toolsUsed: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('hides phones and e-mails from the AI provider', async () => {
    const messages = [
      { role: 'user', content: 'Мой номер 8 (8552) 12-34-56, почта ivan@mail.ru' },
      { role: 'assistant', content: 'Спасибо!' },
      { role: 'user', content: 'Сколько стоит экскаватор на 8 часов?' },
    ];
    await POST(request({ messages }));
    expect(runAgent).toHaveBeenCalledOnce();
    const sent = JSON.stringify([routeToAgent.mock.calls[0]?.[0], runAgent.mock.calls[0]?.[1]]);
    expect(sent).not.toContain('12-34-56');
    expect(sent).not.toContain('ivan@mail.ru');
    expect(sent).toContain('[контакт скрыт]');
    expect(sent).toContain('на 8 часов');
  });

  it('limits chat leads per IP like the site forms', async () => {
    const sameIp = () =>
      new NextRequest('http://localhost/api/ai/agents', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.2.0.1' },
        body: JSON.stringify({ agentId: 'auto', messages: phoneMessage, consent: true }),
      });
    for (let i = 0; i < 5; i += 1) expect((await POST(sameIp())).status).toBe(200);
    const blocked = await POST(sameIp());
    expect(blocked.status).toBe(429);
    expect(create).toHaveBeenCalledTimes(5);
  });
});
