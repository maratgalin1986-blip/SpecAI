import { prisma } from '@specai/database';

/**
 * Where the daily «Заявки за сутки» post goes (lib/channelDigest.ts): the
 * TELEGRAM_CHANNEL_ID variable when set, else a chat the owner picked in
 * /admin → «Чаты с ботом» («Сводка заявок сюда»), so no Vercel setting is
 * needed (owner, 2026-10-17: his group «Услуги спецтехники РТ»). Only a chat
 * the bot is in and may write to can be picked.
 */
export const CHANNEL_CHAT_KEY = 'channel.chatId';

/** The chat picked in /admin, as stored (the admin card shows it even when it went stale). */
export async function loadPickedChannelChatId(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: CHANNEL_CHAT_KEY } });
  return row?.value.trim() || null;
}

/** A chat the daily post may go to: the bot is there, may write, and was not told /quiet. */
function postable(chat: { removedAt: Date | null; canWrite: boolean; quiet: boolean } | null) {
  return Boolean(chat && !chat.removedAt && chat.canWrite && !chat.quiet);
}

/**
 * The chat of today's post: the variable, else the pick — re-checked every
 * time, so a chat that removed the bot or said /quiet gets nothing.
 */
export async function loadChannelChatId(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (fromEnv) return fromEnv;
  const picked = await loadPickedChannelChatId();
  if (!picked) return null;
  const chat = await prisma.botChat.findUnique({ where: { chatId: picked } });
  return postable(chat) ? picked : null;
}

/** The variable overrides the pick (the admin card says so). */
export function channelFromEnv(): boolean {
  return Boolean(process.env.TELEGRAM_CHANNEL_ID?.trim());
}

export type PickResult = { ok: true; chatId: string | null } | { ok: false; error: string };

/** Picks a chat for the daily post, or clears the choice with null. */
export async function pickChannelChat(input: unknown): Promise<PickResult> {
  if (input === null) {
    await prisma.appSetting.deleteMany({ where: { key: CHANNEL_CHAT_KEY } });
    return { ok: true, chatId: null };
  }
  if (typeof input !== 'string' || !/^-?\d{1,20}$/.test(input)) {
    return { ok: false, error: 'Неверный чат' };
  }
  const chat = await prisma.botChat.findUnique({ where: { chatId: input } });
  if (!postable(chat)) {
    return {
      ok: false,
      error: 'Бота нет в этом чате, ему нельзя писать или его выключили (/quiet)',
    };
  }
  await prisma.appSetting.upsert({
    where: { key: CHANNEL_CHAT_KEY },
    update: { value: input },
    create: { key: CHANNEL_CHAT_KEY, value: input },
  });
  return { ok: true, chatId: input };
}

/**
 * The owner added the bot to a chat himself (the update's `from` is the
 * owner's own Telegram chat, TELEGRAM_CHAT_ID — the private chat id of a
 * person is their user id): with no channel chosen yet, the daily post goes
 * there, without a visit to /admin. Anyone else adding the bot changes nothing.
 */
export async function autoPickOwnersChat(chatId: string, addedBy: number | undefined) {
  const owner = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!owner || !addedBy || addedBy <= 0 || owner !== String(addedBy)) return false;
  if (process.env.TELEGRAM_CHANNEL_ID?.trim()) return false;
  // A live pick stays; a dead one (bot removed, /quiet) gives way.
  if (await loadChannelChatId()) return false;
  const chat = await prisma.botChat.findUnique({ where: { chatId } });
  if (!postable(chat)) return false;
  await prisma.appSetting.upsert({
    where: { key: CHANNEL_CHAT_KEY },
    update: { value: chatId },
    create: { key: CHANNEL_CHAT_KEY, value: chatId },
  });
  // Two chats added at once: only the one that ended up stored says so.
  return (await loadPickedChannelChatId()) === chatId;
}
