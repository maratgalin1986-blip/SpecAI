import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createBotDb } from '@/lib/groupBotFakeDb';

// The webhook in group chats: one public reply under a published order, never
// for duplicates, orders under review or quiet chats; admin-only commands;
// my_chat_member; and always a quick 200 when Telegram itself fails.

const db = createBotDb();
const ingestMessage = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({ prisma: db.prisma }));
vi.mock('@/lib/ingest', () => ({ ingestMessage }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));
vi.mock('@/lib/botDrafts', () => ({
  sendDueReminders: async () => undefined,
  attachPhone: vi.fn(),
  findDraft: vi.fn(),
  saveDraft: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/lib/integrations', () => ({
  telegramWebhookSecret: () => 'secret',
  safeEqual: (a: string | null, b: string | null) => a === b,
}));

type Sent = { method: string; body: Record<string, unknown> };
const sent: Sent[] = [];
let answer: (call: Sent) => Promise<Response> = async () => new Response('{"ok":true}');
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    const call = { method: url.split('/').pop()!, body: JSON.parse(init.body) };
    sent.push(call);
    return answer(call);
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';

const { POST } = await import('./route');

const post = async (update: unknown) => {
  const res = await POST(
    new NextRequest('http://localhost/api/integrations/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secret' },
      body: JSON.stringify(update),
    }),
  );
  return { status: res.status, body: await res.json() };
};

const chat = { id: -100777, type: 'supergroup', title: 'Стройка Челны' };
const ORDER_TEXT = 'Нужен экскаватор-погрузчик завтра в Елабуге, звоните +7 927 111-22-33 Иван';
const orderMessage = (id = 10) => ({
  message: {
    message_id: id,
    text: ORDER_TEXT,
    chat,
    from: { id: 5, first_name: 'Иван', last_name: 'Петров', username: 'ivan_p' },
  },
});
const replies = () => sent.filter((c) => c.method === 'sendMessage');

beforeEach(() => {
  db.reset();
  sent.length = 0;
  ingestMessage.mockReset();
  notifyTelegram.mockReset();
  answer = async () => new Response('{"ok":true}');
});

describe('group order replies', () => {
  it('replies once under a published order, without phone or names', async () => {
    ingestMessage.mockResolvedValue({ status: 'created', orderId: 'ord1', published: true });
    const res = await post(orderMessage());
    expect(res).toMatchObject({ status: 200, body: { result: 'created', reply: 'sent' } });
    expect(ingestMessage.mock.calls[0]![0]).toMatchObject({ openChat: true });
    const [reply] = replies();
    expect(reply!.body.reply_parameters).toMatchObject({ message_id: 10 });
    const text = reply!.body.text as string;
    expect(text).toContain('/orders/ord1?utm_source=telegram&utm_medium=bot');
    for (const piece of ['927', '111-22-33', '1112233', 'Иван', 'Петров', 'ivan_p']) {
      expect(text).not.toContain(piece);
    }
    expect(db.chats.get(String(chat.id))).toMatchObject({ title: 'Стройка Челны' });
  });

  it.each([
    ['under review', { status: 'created', orderId: 'o2', published: false }],
    ['a duplicate', { status: 'duplicate', reason: 'repost' }],
    ['not an order', { status: 'ignored' }],
  ])('stays silent for %s', async (_, result) => {
    ingestMessage.mockResolvedValue(result);
    const res = await post(orderMessage());
    expect(res.status).toBe(200);
    expect(replies()).toHaveLength(0);
  });

  it('neither imports nor replies in a quiet chat', async () => {
    db.chats.set(String(chat.id), {
      chatId: String(chat.id),
      title: chat.title,
      username: null,
      quiet: true,
      canWrite: true,
      removedAt: null,
      repliesToday: 0,
      repliesDay: null,
      addedAt: new Date(),
    });
    const res = await post(orderMessage());
    expect(res).toMatchObject({ status: 200, body: { result: 'quiet' } });
    expect(ingestMessage).not.toHaveBeenCalled();
    expect(replies()).toHaveLength(0);
  });

  it('answers 200 when Telegram fails on the reply', async () => {
    ingestMessage.mockResolvedValue({ status: 'created', orderId: 'o3', published: true });
    answer = async () => {
      throw new Error('network down');
    };
    const res = await post(orderMessage());
    expect(res).toMatchObject({ status: 200, body: { result: 'created', reply: 'failed' } });
  });

  it('answers 200 when Telegram answers with an error page', async () => {
    ingestMessage.mockResolvedValue({ status: 'created', orderId: 'o4', published: true });
    answer = async () => new Response('Bad Gateway', { status: 502 });
    const res = await post(orderMessage());
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('failed');
  });

  it('still imports, without a reply, when the chat table is unavailable', async () => {
    const findUnique = db.prisma.botChat.findUnique;
    db.prisma.botChat.findUnique = async () => {
      throw new Error('no table yet');
    };
    try {
      ingestMessage.mockResolvedValue({ status: 'created', orderId: 'o5', published: true });
      const res = await post(orderMessage());
      expect(res.status).toBe(200);
      expect(ingestMessage).toHaveBeenCalledOnce();
      expect(replies()).toHaveLength(0);
    } finally {
      db.prisma.botChat.findUnique = findUnique;
    }
  });
});

describe('group commands', () => {
  const command = (text: string, fromId = 5) => ({
    message: { message_id: 20, text, chat: { ...chat, id: -100778 }, from: { id: fromId } },
  });

  it('a member cannot switch the bot off', async () => {
    answer = async (call) =>
      new Response(
        JSON.stringify(
          call.method === 'getChatMember'
            ? { ok: true, result: { status: 'member' } }
            : { ok: true },
        ),
      );
    const res = await post(command('/quiet'));
    expect(res).toMatchObject({ status: 200, body: { result: 'not_admin' } });
    expect(db.chats.get('-100778')).toBeUndefined();
    expect(ingestMessage).not.toHaveBeenCalled();
  });

  it('an admin can, and then the chat is not imported', async () => {
    answer = async (call) =>
      new Response(
        JSON.stringify(
          call.method === 'getChatMember'
            ? { ok: true, result: { status: 'creator' } }
            : { ok: true },
        ),
      );
    const res = await post(command('/quiet@specplast16_zayavki_bot'));
    expect(res.body.result).toBe('done');
    expect(db.chats.get('-100778')!.quiet).toBe(true);
    await post({ message: { ...orderMessage().message, chat: { ...chat, id: -100778 } } });
    expect(ingestMessage).not.toHaveBeenCalled();
  });
});

describe('my_chat_member', () => {
  it('records the chat and tells the owner', async () => {
    const res = await post({
      my_chat_member: {
        chat,
        from: { id: 5 },
        old_chat_member: { status: 'left' },
        new_chat_member: { status: 'member' },
      },
    });
    expect(res).toMatchObject({ status: 200, body: { result: 'added' } });
    expect(notifyTelegram).toHaveBeenCalledWith('Бот добавлен в чат: Стройка Челны');
  });

  it('answers 200 even if the database fails', async () => {
    const upsert = db.prisma.botChat.upsert;
    db.prisma.botChat.upsert = async () => {
      throw new Error('db down');
    };
    try {
      const res = await post({
        my_chat_member: {
          chat,
          old_chat_member: { status: 'left' },
          new_chat_member: { status: 'member' },
        },
      });
      expect(res).toMatchObject({ status: 200, body: { result: 'error' } });
    } finally {
      db.prisma.botChat.upsert = upsert;
    }
  });
});

describe('group upgraded to a supergroup', () => {
  const quietGroup = () =>
    db.chats.set('-55', {
      chatId: '-55',
      title: 'Старый чат',
      username: null,
      quiet: true,
      canWrite: true,
      removedAt: null,
      repliesToday: 0,
      repliesDay: null,
      addedAt: new Date(),
    });

  it('keeps /quiet under the new id, from either service message', async () => {
    quietGroup();
    const res = await post({
      message: {
        message_id: 1,
        chat: { id: -100555, type: 'supergroup' },
        migrate_from_chat_id: -55,
      },
    });
    expect(res.status).toBe(200);
    expect(db.chats.get('-100555')!.quiet).toBe(true);
    ingestMessage.mockResolvedValue({ status: 'created', orderId: 'o9', published: true });
    await post({ message: { ...orderMessage().message, chat: { ...chat, id: -100555 } } });
    expect(ingestMessage).not.toHaveBeenCalled();
  });

  it('asks Telegram to retry when the move fails', async () => {
    quietGroup();
    const upsert = db.prisma.botChat.upsert;
    db.prisma.botChat.upsert = async () => {
      throw new Error('db down');
    };
    try {
      const res = await post({
        message: { message_id: 2, chat: { id: -55, type: 'group' }, migrate_to_chat_id: -100556 },
      });
      expect(res.status).toBe(500);
    } finally {
      db.prisma.botChat.upsert = upsert;
    }
  });
});
