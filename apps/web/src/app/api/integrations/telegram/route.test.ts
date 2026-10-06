import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const create = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { lead: { create, findFirst, findMany, update, updateMany, deleteMany } },
}));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/integrations', () => ({
  telegramWebhookSecret: () => 'secret',
  safeEqual: (a: string | null, b: string | null) => a === b,
}));

const sent: { method: string; body: Record<string, unknown> }[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    sent.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) });
    return new Response('{"ok":true}');
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';

const { POST } = await import('./route');

const post = (update: unknown) =>
  POST(
    new NextRequest('http://localhost/api/integrations/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secret' },
      body: JSON.stringify(update),
    }),
  );
const chat = { id: 777, type: 'private' };

describe('bot funnel webhook', () => {
  beforeEach(() => {
    sent.length = 0;
    for (const f of [create, findFirst, findMany, update, updateMany, deleteMany, notifyTelegram])
      f.mockReset();
    findMany.mockResolvedValue([]);
    notifyTelegram.mockResolvedValue(true);
  });

  it('answers /start with the machine buttons carrying the source', async () => {
    await post({ message: { message_id: 1, text: '/start arenda-samosval__direct-kran', chat } });
    const keyboard = (
      sent[0]!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    ).inline_keyboard;
    expect(keyboard.flat()[0]!.callback_data).toMatch(/^m\|0\|arenda-samosval__direct-kran$/);
  });

  it('saves a draft at the place step and completes it with the shared contact', async () => {
    await post({
      callback_query: {
        id: 'q',
        data: 'p|0|1|0|home__master',
        from: { id: 1, first_name: 'Иван' },
        message: { chat },
      },
    });
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]![0].data;
    expect(data.source).toBe('tg-bot:home__master');
    expect(data.phone).toBe('');
    expect(data.message).toContain('[tg:777]');

    findFirst.mockResolvedValue({
      id: 'L1',
      name: 'Иван',
      source: data.source,
      message: data.message,
    });
    await post({
      message: {
        message_id: 2,
        chat,
        contact: { phone_number: '+79272428088', user_id: 5 },
        from: { id: 5, first_name: 'Иван' },
      },
    });
    expect(update.mock.calls[0]![0].data.phone).toBe('+79272428088');
    expect(update.mock.calls[0]![0].data.message).not.toContain('[черновик]');
    const text = notifyTelegram.mock.calls[0]![0] as string;
    expect(text).toContain('+79272428088');
    expect(text).toContain('кампания master');
    expect(text).toContain('Иван');
    // Other empty drafts of the chat are removed.
    expect(deleteMany).toHaveBeenCalledOnce();
  });

  it('ignores a contact card of someone else', async () => {
    findFirst.mockResolvedValue({
      id: 'L1',
      name: 'x',
      source: 'tg-bot:home',
      message: '[tg:777]',
    });
    await post({
      message: {
        message_id: 3,
        chat,
        contact: { phone_number: '+79990000000', user_id: 9 },
        from: { id: 5 },
      },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
