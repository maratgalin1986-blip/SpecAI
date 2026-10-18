import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn(() => true);
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
const setChatSilent = vi.fn();
vi.mock('@/lib/groupBot', () => ({ setChatSilent }));

const { PUT } = await import('./route');

const put = (body: unknown) =>
  PUT(
    new NextRequest('https://example.test/api/admin/bot-chats/silent', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('PUT /api/admin/bot-chats/silent', () => {
  beforeEach(() => {
    isAdminRequest.mockReturnValue(true);
    setChatSilent.mockReset();
    vi.unstubAllEnvs();
  });

  it('is for the admin only', async () => {
    isAdminRequest.mockReturnValue(false);
    expect((await put({ chatId: '-100', silent: false })).status).toBe(401);
    expect(setChatSilent).not.toHaveBeenCalled();
  });

  it('switches the chat, refuses a wrong one, and never from a preview', async () => {
    setChatSilent.mockResolvedValue({ ok: true, chatId: '-100', silent: false });
    const response = await put({ chatId: '-100', silent: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chatId: '-100', silent: false });
    expect(setChatSilent).toHaveBeenCalledWith('-100', false);

    setChatSilent.mockResolvedValue({ ok: false, error: 'Чат не найден' });
    expect((await put({ chatId: '-1', silent: true })).status).toBe(400);
    expect((await put('not json')).status).toBe(400);

    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await put({ chatId: '-100', silent: true })).status).toBe(409);
    expect(setChatSilent).toHaveBeenCalledTimes(3);
  });
});
