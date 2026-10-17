import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = new Map<string, string>();
const chats = new Map<string, { removedAt: Date | null; canWrite: boolean; quiet: boolean }>();
vi.mock('@specai/database', () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = settings.get(where.key);
        return value === undefined ? null : { key: where.key, value };
      }),
      upsert: vi.fn(async ({ create }: { create: { key: string; value: string } }) => {
        settings.set(create.key, create.value);
        return create;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
        return { count: 1 };
      }),
    },
    botChat: {
      findUnique: vi.fn(async ({ where }: { where: { chatId: string } }) => {
        const chat = chats.get(where.chatId);
        return chat ? { chatId: where.chatId, ...chat } : null;
      }),
    },
  },
}));

const { CHANNEL_CHAT_KEY, loadChannelChatId, pickChannelChat } = await import('./channelTarget');

describe('the chat of the daily post', () => {
  beforeEach(() => {
    settings.clear();
    chats.clear();
    vi.unstubAllEnvs();
    vi.stubEnv('TELEGRAM_CHANNEL_ID', '');
  });

  it('picks only a chat the bot is in and may write to', async () => {
    chats.set('-100', { removedAt: null, canWrite: true, quiet: false });
    chats.set('-200', { removedAt: new Date(), canWrite: true, quiet: false });
    chats.set('-300', { removedAt: null, canWrite: false, quiet: false });
    chats.set('-400', { removedAt: null, canWrite: true, quiet: true });
    expect(await pickChannelChat('-400')).toMatchObject({ ok: false });
    expect(await pickChannelChat('-200')).toMatchObject({ ok: false });
    expect(await pickChannelChat('-300')).toMatchObject({ ok: false });
    expect(await pickChannelChat('-999')).toMatchObject({ ok: false });
    expect(await pickChannelChat('@someone')).toMatchObject({ ok: false });
    expect(await pickChannelChat('-100')).toEqual({ ok: true, chatId: '-100' });
    expect(settings.get(CHANNEL_CHAT_KEY)).toBe('-100');
    expect(await loadChannelChatId()).toBe('-100');
    expect(await pickChannelChat(null)).toEqual({ ok: true, chatId: null });
    expect(await loadChannelChatId()).toBeNull();
  });

  it('a picked chat that removed the bot or said /quiet gets no post', async () => {
    settings.set(CHANNEL_CHAT_KEY, '-100');
    chats.set('-100', { removedAt: null, canWrite: true, quiet: true });
    expect(await loadChannelChatId()).toBeNull();
    chats.set('-100', { removedAt: new Date(), canWrite: false, quiet: false });
    expect(await loadChannelChatId()).toBeNull();
  });

  it('the variable wins over the pick', async () => {
    settings.set(CHANNEL_CHAT_KEY, '-100');
    vi.stubEnv('TELEGRAM_CHANNEL_ID', '@own_channel');
    expect(await loadChannelChatId()).toBe('@own_channel');
  });
});
