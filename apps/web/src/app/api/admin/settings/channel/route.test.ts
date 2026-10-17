import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const isAdminRequest = vi.fn(() => true);
vi.mock('@/lib/admin', () => ({ isAdminRequest }));
const pickChannelChat = vi.fn();
vi.mock('@/lib/channelTarget', () => ({ pickChannelChat }));

const { PUT } = await import('./route');

const put = (body: unknown) =>
  PUT(
    new NextRequest('https://example.test/api/admin/settings/channel', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('PUT /api/admin/settings/channel', () => {
  beforeEach(() => {
    isAdminRequest.mockReturnValue(true);
    pickChannelChat.mockReset();
    vi.unstubAllEnvs();
  });

  it('is for the admin only', async () => {
    isAdminRequest.mockReturnValue(false);
    expect((await put({ chatId: '-100' })).status).toBe(401);
    expect(pickChannelChat).not.toHaveBeenCalled();
  });

  it('refuses a body without chatId and a refused pick', async () => {
    expect((await put('not json')).status).toBe(400);
    expect((await put({})).status).toBe(400);
    pickChannelChat.mockResolvedValue({ ok: false, error: 'Неверный чат' });
    expect((await put({ chatId: 'x' })).status).toBe(400);
  });

  it('saves the pick, and never from a preview', async () => {
    pickChannelChat.mockResolvedValue({ ok: true, chatId: '-100' });
    const response = await put({ chatId: '-100' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chatId: '-100' });
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await put({ chatId: '-100' })).status).toBe(409);
    expect(pickChannelChat).toHaveBeenCalledTimes(1);
  });
});
