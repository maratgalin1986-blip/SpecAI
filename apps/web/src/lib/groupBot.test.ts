import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBotDb } from './groupBotFakeDb';

const db = createBotDb();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({ prisma: db.prisma }));
vi.mock('@/lib/notify', () => ({ notifyTelegram }));

type Sent = { method: string; body: Record<string, unknown> };
const sent: Sent[] = [];
let answer: (call: Sent) => unknown = () => ({ ok: true, result: {} });
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    const call = { method: url.split('/').pop()!, body: JSON.parse(init.body) };
    sent.push(call);
    return new Response(JSON.stringify(answer(call)));
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';

const bot = await import('./groupBot');
const {
  REPLY_LIMITS,
  QUIET_TEXT,
  RESUME_TEXT,
  campaignFor,
  followUpOnBid,
  followUpText,
  handleGroupCommand,
  onChatMigrated,
  onMyChatMember,
  parseGroupCommand,
  replyText,
  replyUnderOrder,
} = bot;

const GROUP = { id: -100500, type: 'supergroup', title: 'Стройка Казань', username: 'Stroika_Kzn' };
const messages = () => sent.filter((call) => call.method === 'sendMessage');
const message = (id: number, chat = GROUP) => ({ message_id: id, chat, from: { id: 42 } });
const at = (iso: string) => new Date(iso);

async function chatInDb(data: Record<string, unknown> = {}) {
  await db.prisma.botChat.upsert({
    where: { chatId: String(GROUP.id) },
    create: { chatId: String(GROUP.id), title: GROUP.title, username: GROUP.username, ...data },
    update: data,
  });
}

beforeEach(() => {
  db.reset();
  sent.length = 0;
  notifyTelegram.mockReset();
  answer = () => ({ ok: true, result: {} });
});

describe('texts', () => {
  it('fit in two lines and name the platform, with a tagged link', () => {
    const text = replyText('https://x.ru/orders/o1?utm_source=telegram');
    expect(text.split('\n').length).toBeLessThanOrEqual(2);
    expect(text).toContain('ИИСтройка24');
    expect(followUpText(1, 'L')).toBe('По заявке уже 1 предложение — посмотреть: L');
    expect(followUpText(3, 'L')).toContain('3 предложения');
    expect(followUpText(5, 'L')).toContain('5 предложений');
  });

  it('tags links with the chat handle or, without one, its id', () => {
    expect(campaignFor(GROUP)).toBe('stroika_kzn');
    expect(campaignFor({ id: -100123 })).toBe('chat100123');
  });

  it('reads only commands meant for this bot', () => {
    expect(parseGroupCommand('/quiet', 'my_bot')).toBe('quiet');
    expect(parseGroupCommand('/RESUME@My_Bot', 'my_bot')).toBe('resume');
    expect(parseGroupCommand('/about please', 'my_bot')).toBe('about');
    expect(parseGroupCommand('/quiet@other_bot', 'my_bot')).toBeNull();
    expect(parseGroupCommand('/quietly', 'my_bot')).toBeNull();
    expect(parseGroupCommand('нужен /quiet', 'my_bot')).toBeNull();
  });
});

describe('replyUnderOrder', () => {
  it('answers in the thread, silently, without a link preview', async () => {
    await chatInDb();
    const result = await replyUnderOrder(message(77), 'ord1', at('2026-10-17T09:00:00Z'));
    expect(result).toBe('sent');
    const [call] = messages();
    expect(call!.body).toMatchObject({
      chat_id: String(GROUP.id),
      disable_notification: true,
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: 77, allow_sending_without_reply: false },
    });
    const text = call!.body.text as string;
    expect(text).toContain(
      '/orders/ord1?utm_source=telegram&utm_medium=bot&utm_campaign=stroika_kzn',
    );
    expect(db.chats.get(String(GROUP.id))!.repliesToday).toBe(1);
  });

  it('stays in the forum topic the order came from', async () => {
    await chatInDb();
    await replyUnderOrder(
      { ...message(5), is_topic_message: true, message_thread_id: 9 },
      'ord1',
      at('2026-10-17T09:00:00Z'),
    );
    expect(messages()[0]!.body.message_thread_id).toBe(9);
  });

  it('says nothing in a quiet chat, an unknown chat or a private chat', async () => {
    expect(await replyUnderOrder(message(1), 'o0')).toBe('quiet');
    await chatInDb({ quiet: true });
    expect(await replyUnderOrder(message(1), 'o1')).toBe('quiet');
    expect(await replyUnderOrder(message(2, { id: 5, type: 'private' } as never), 'o2')).toBe(
      'not_group',
    );
    expect(messages()).toHaveLength(0);
  });

  it(`keeps to ${REPLY_LIMITS.perHour} replies an hour`, async () => {
    await chatInDb();
    const base = at('2026-10-17T09:00:00Z').getTime();
    for (let i = 0; i < REPLY_LIMITS.perHour; i += 1) {
      expect(await replyUnderOrder(message(i), `o${i}`, new Date(base + i * 60_000))).toBe('sent');
    }
    expect(await replyUnderOrder(message(10), 'o10', new Date(base + 10 * 60_000))).toBe('limited');
    // An hour after the first reply there is room again.
    expect(await replyUnderOrder(message(11), 'o11', new Date(base + 61 * 60_000))).toBe('sent');
    expect(messages()).toHaveLength(REPLY_LIMITS.perHour + 1);
  });

  it(`keeps to ${REPLY_LIMITS.perDay} replies a Moscow day and starts over the next one`, async () => {
    await chatInDb();
    // 06:00 Moscow (03:00 UTC), one reply every 30 minutes: never 3 in an hour.
    const base = at('2026-10-17T03:00:00Z').getTime();
    const results = [];
    for (let i = 0; i < REPLY_LIMITS.perDay + 2; i += 1) {
      results.push(await replyUnderOrder(message(i), `o${i}`, new Date(base + i * 30 * 60_000)));
    }
    expect(results.filter((r) => r === 'sent')).toHaveLength(REPLY_LIMITS.perDay);
    expect(results.at(-1)).toBe('limited');
    // 00:30 Moscow next day.
    expect(await replyUnderOrder(message(99), 'next', at('2026-10-17T21:30:00Z'))).toBe('sent');
    expect(db.chats.get(String(GROUP.id))).toMatchObject({
      repliesDay: '2026-10-18',
      repliesToday: 1,
    });
  });

  it('remembers when Telegram does not let the bot write', async () => {
    await chatInDb();
    answer = () => ({ ok: false, error_code: 403, description: 'Forbidden: bot was kicked' });
    expect(await replyUnderOrder(message(1), 'o1', at('2026-10-17T09:00:00Z'))).toBe('failed');
    expect(db.replies.has('o1')).toBe(false);
    expect(db.chats.get(String(GROUP.id))!.canWrite).toBe(false);
    // The message was not sent: the day's slot is given back.
    expect(db.chats.get(String(GROUP.id))!.repliesToday).toBe(0);
    expect(await replyUnderOrder(message(2), 'o2', at('2026-10-17T09:05:00Z'))).toBe(
      'cannot_write',
    );
  });

  it('does not go silent for good after a temporary «not enough rights»', async () => {
    await chatInDb();
    answer = () => ({ ok: false, error_code: 400, description: 'Bad Request: not enough rights' });
    expect(await replyUnderOrder(message(1), 'o1', at('2026-10-17T09:00:00Z'))).toBe('failed');
    expect(db.chats.get(String(GROUP.id))).toMatchObject({ canWrite: true, repliesToday: 0 });
    answer = () => ({ ok: true, result: {} });
    expect(await replyUnderOrder(message(2), 'o2', at('2026-10-17T09:05:00Z'))).toBe('sent');
  });

  it('counts a follow-up as a message of the hour', async () => {
    await chatInDb();
    const base = at('2026-10-17T09:00:00Z').getTime();
    await replyUnderOrder(message(1), 'a', new Date(base));
    await replyUnderOrder(message(2), 'b', new Date(base + 5 * 60_000));
    db.state.bids = 1;
    expect(await followUpOnBid('a', new Date(base + 10 * 60_000))).toBe('sent');
    // 2 replies + 1 follow-up within the hour: the third order waits.
    expect(await replyUnderOrder(message(3), 'c', new Date(base + 15 * 60_000))).toBe('limited');
    expect(await followUpOnBid('b', new Date(base + 20 * 60_000))).toBe('limited');
    expect(db.replies.get('b')!.followUpAt).toBeNull();
    expect(messages()).toHaveLength(3);
  });
});

describe('followUpOnBid', () => {
  it('posts once per order, with the count, under the order message', async () => {
    await chatInDb();
    await replyUnderOrder(message(77), 'ord1', at('2026-10-17T09:00:00Z'));
    sent.length = 0;
    db.state.bids = 2;
    expect(await followUpOnBid('ord1', at('2026-10-17T12:00:00Z'))).toBe('sent');
    const [call] = messages();
    expect(call!.body.text).toMatch(
      /^По заявке уже 2 предложения — посмотреть: .+\/orders\/ord1\?/,
    );
    expect(call!.body.reply_parameters).toMatchObject({ message_id: 77 });
    expect(await followUpOnBid('ord1', at('2026-10-17T13:00:00Z'))).toBe('none');
    expect(messages()).toHaveLength(1);
  });

  it('does nothing for orders the bot did not answer, or without bids', async () => {
    db.state.bids = 1;
    expect(await followUpOnBid('unknown')).toBe('none');
    await chatInDb();
    await replyUnderOrder(message(1), 'o1', at('2026-10-17T09:00:00Z'));
    db.state.bids = 0;
    expect(await followUpOnBid('o1', at('2026-10-17T12:00:00Z'))).toBe('none');
  });

  it('respects a chat that went quiet, and may try at the next bid', async () => {
    await chatInDb();
    await replyUnderOrder(message(1), 'o1', at('2026-10-17T09:00:00Z'));
    sent.length = 0;
    await chatInDb({ quiet: true });
    db.state.bids = 1;
    expect(await followUpOnBid('o1', at('2026-10-17T12:00:00Z'))).toBe('quiet');
    expect(db.replies.get('o1')!.followUpAt).toBeNull();
    expect(messages()).toHaveLength(0);
  });

  it('never posts on its own when the order message was deleted', async () => {
    await chatInDb();
    await replyUnderOrder(message(1), 'o1', at('2026-10-17T09:00:00Z'));
    answer = () => ({
      ok: false,
      error_code: 400,
      description: 'Bad Request: message to be replied not found',
    });
    db.state.bids = 1;
    expect(await followUpOnBid('o1', at('2026-10-17T12:00:00Z'))).toBe('failed');
    const call = messages().at(-1)!;
    expect(call.body.reply_parameters).toMatchObject({ allow_sending_without_reply: false });
    // Settled: the next bid does not try again.
    expect(db.replies.get('o1')!.followUpAt).toBeInstanceOf(Date);
    expect(await followUpOnBid('o1', at('2026-10-17T13:00:00Z'))).toBe('none');
  });
});

describe('admin commands', () => {
  const command = (text: string, extra: Record<string, unknown> = {}) => ({
    message_id: 3,
    text,
    chat: GROUP,
    from: { id: 42 },
    ...extra,
  });

  it('ignore members who are not admins', async () => {
    answer = (call) =>
      call.method === 'getChatMember' ? { ok: true, result: { status: 'member' } } : { ok: true };
    expect(await handleGroupCommand(command('/quiet'), 'quiet')).toBe('not_admin');
    expect(db.chats.size).toBe(0);
    expect(messages()).toHaveLength(0);
  });

  it('let an admin switch the bot off and on', async () => {
    answer = (call) =>
      call.method === 'getChatMember'
        ? { ok: true, result: { status: 'administrator' } }
        : { ok: true };
    expect(await handleGroupCommand(command('/quiet'), 'quiet')).toBe('done');
    expect(sent.find((c) => c.method === 'getChatMember')!.body).toMatchObject({ user_id: 42 });
    expect(db.chats.get(String(GROUP.id))!.quiet).toBe(true);
    expect(messages()[0]!.body.text).toBe(QUIET_TEXT);
    db.chats.get(String(GROUP.id))!.canWrite = false;
    expect(await handleGroupCommand(command('/resume'), 'resume')).toBe('done');
    // /resume also clears a refusal the bot remembered.
    expect(db.chats.get(String(GROUP.id))).toMatchObject({ quiet: false, canWrite: true });
    expect(messages()[1]!.body.text).toBe(RESUME_TEXT);
  });

  it('trust an anonymous admin writing on behalf of the group', async () => {
    const result = await handleGroupCommand(
      command('/about', { from: { id: 1087968824, is_bot: true }, sender_chat: { id: GROUP.id } }),
      'about',
    );
    expect(result).toBe('done');
    expect(sent.some((c) => c.method === 'getChatMember')).toBe(false);
    expect(messages()[0]!.body.text).toContain('/bot');
  });

  it('a failed admin check counts as «not an admin»', async () => {
    answer = () => ({ ok: false, error_code: 400 });
    expect(
      await handleGroupCommand(command('/resume', { chat: { ...GROUP, id: -7 } }), 'resume'),
    ).toBe('not_admin');
  });
});

describe('onMyChatMember', () => {
  const update = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
    chat: GROUP,
    old_chat_member: { status: from },
    new_chat_member: { status: to, ...extra },
  });

  it('records the chat, tells the owner and says hello once', async () => {
    expect(await onMyChatMember(update('left', 'member'))).toBe('added');
    expect(db.chats.get(String(GROUP.id))).toMatchObject({ title: GROUP.title, canWrite: true });
    expect(notifyTelegram).toHaveBeenCalledWith('Бот добавлен в чат: Стройка Казань');
    expect(messages()).toHaveLength(1);
    expect(messages()[0]!.body.reply_parameters).toBeUndefined();
    // Promoted to admin: no second hello.
    expect(await onMyChatMember(update('member', 'administrator'))).toBe('changed');
    expect(messages()).toHaveLength(1);
  });

  it('marks a removed bot and keeps a quiet chat quiet when it comes back', async () => {
    await chatInDb({ quiet: true });
    expect(await onMyChatMember(update('member', 'kicked'))).toBe('removed');
    expect(db.chats.get(String(GROUP.id))!.removedAt).toBeInstanceOf(Date);
    expect(notifyTelegram).toHaveBeenCalledWith('Бот удалён из чата: Стройка Казань');
    expect(await onMyChatMember(update('left', 'member'))).toBe('added');
    expect(db.chats.get(String(GROUP.id))).toMatchObject({ quiet: true, removedAt: null });
    expect(messages()).toHaveLength(0);
  });

  it('notes a bot that may not write, and ignores private chats', async () => {
    await onMyChatMember(
      update('left', 'restricted', { is_member: true, can_send_messages: false }),
    );
    expect(db.chats.get(String(GROUP.id))!.canWrite).toBe(false);
    expect(messages()).toHaveLength(0);
    expect(
      await onMyChatMember({ ...update('member', 'kicked'), chat: { id: 5, type: 'private' } }),
    ).toBe('ignored');
  });

  it('moves the chat to its new supergroup id', async () => {
    await chatInDb({ quiet: true });
    await onChatMigrated(GROUP.id, -1009);
    expect(db.chats.get('-1009')).toMatchObject({ quiet: true, title: GROUP.title });
    expect(db.chats.get(String(GROUP.id))!.canWrite).toBe(false);
  });
});
