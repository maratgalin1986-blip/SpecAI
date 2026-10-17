// The Telegram bot in group chats whose admins added it: a short public reply
// under a published order message (a link where providers send prices), one
// follow-up when bids arrive, the admins' /quiet, /resume and /about, and
// bookkeeping of the chats (BotChat) when the bot is added or removed.
//
// Hard limits (ФЗ «О рекламе» ст. 18, 152-ФЗ, Telegram ToS): the bot answers
// only publicly, in the thread where the order was posted; it never writes to
// the author or anyone else in private, and its messages carry no phone
// numbers or names. A quiet chat gets neither replies nor import.

import { prisma, type Prisma } from '@specai/database';
import { moscowDateKey } from '@/lib/bookingRules';
import { notifyTelegram } from '@/lib/notify';
import { pluralizeRu } from '@/lib/pluralize';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import { telegramRequest, type TelegramResponse } from '@/lib/telegramApi';
import { CHANNEL_CHAT_KEY } from './channelTarget';

/** Replies (and follow-ups) per chat: a chat must never feel spammed. */
export const REPLY_LIMITS = { perHour: 3, perDay: 15 } as const;

/** The public page for chat admins. */
export const BOT_PAGE_PATH = '/bot';

export interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TgGroupMessage {
  message_id: number;
  text?: string;
  chat: TgChat;
  from?: { id?: number; is_bot?: boolean };
  /** The chat itself for an anonymous group admin or a channel post. */
  sender_chat?: { id: number };
  message_thread_id?: number;
  is_topic_message?: boolean;
}

export const isGroupChat = (type: string | undefined) => type === 'group' || type === 'supergroup';

/** utm_campaign of the links: the group's public @handle, else its id. */
export function campaignFor(chat: { id: number | string; username?: string | null }): string {
  const slug = (chat.username ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40);
  return slug || `chat${String(chat.id).replace(/\D/g, '')}`;
}

export function orderLink(orderId: string, campaign: string): string {
  const query = new URLSearchParams({
    utm_source: 'telegram',
    utm_medium: 'bot',
    utm_campaign: campaign,
  });
  return `${siteUrl()}/orders/${encodeURIComponent(orderId)}?${query}`;
}

// The texts. Fixed templates: an order id and a count are the only variables,
// so no phone number or name of anyone can get into the chat through them.
export function replyText(link: string): string {
  // The author has no account: providers reach them, the link is for providers.
  return `Заявку увидят исполнители рядом на ${SITE.platform} и свяжутся с автором. Есть такая техника — предложите цену: ${link}`;
}

export function followUpText(count: number, link: string): string {
  const offers = pluralizeRu(count, ['предложение', 'предложения', 'предложений']);
  return `По заявке уже ${offers} от исполнителей — они свяжутся с автором. Заявка: ${link}`;
}

export function aboutText(): string {
  return (
    `Бот ${SITE.platform} отвечает на заявки о спецтехнике ссылкой, где исполнители присылают цены. ` +
    `Не пишет в личку и не рассылает рекламу; админ чата выключает его командой /quiet.\n` +
    `${SITE.promiseLine}\n` +
    `Подробнее: ${siteUrl()}${BOT_PAGE_PATH}`
  );
}

export const QUIET_TEXT =
  'Бот выключен в этом чате: не отвечает на заявки и не собирает их. Включить снова — /resume.';

export const RESUME_TEXT =
  'Бот снова включён: на заявки о технике отвечает ссылкой, где исполнители присылают цены. ' +
  'Выключить — /quiet.';

export type GroupCommand = 'quiet' | 'resume' | 'about';

/** «/quiet», «/quiet@<this bot>»; a command addressed to another bot is not ours. */
export function parseGroupCommand(
  text: string | undefined,
  botUsername: string,
): GroupCommand | null {
  const match = /^\/(quiet|resume|about)(?:@(\w+))?(?:\s|$)/i.exec((text ?? '').trim());
  if (!match) return null;
  if (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  return match[1]!.toLowerCase() as GroupCommand;
}

async function send(
  chatId: number | string,
  text: string,
  replyTo?: { messageId: number; threadId?: number | null },
): Promise<TelegramResponse> {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    disable_notification: true,
    link_preview_options: { is_disabled: true },
    ...(replyTo?.threadId ? { message_thread_id: replyTo.threadId } : {}),
    // Only under the order: a deleted order message gets no standalone post.
    ...(replyTo
      ? { reply_parameters: { message_id: replyTo.messageId, allow_sending_without_reply: false } }
      : {}),
  });
}

/**
 * Telegram says the bot is not in the chat (kicked, left): it stays silent
 * there until my_chat_member brings it back. A 400 «not enough rights» (a chat
 * switched to admins-only for the night) is not remembered: the next order
 * simply tries again.
 */
export const notInChat = (res: TelegramResponse) => res.error_code === 403;

/** The order message is gone (the author deleted it): nothing to reply under. */
export const orderMessageGone = (res: TelegramResponse) =>
  res.error_code === 400 &&
  /message to be replied not found|replied message not found/i.test(res.description ?? '');

async function noteRefusal(chatId: string, res: TelegramResponse) {
  if (notInChat(res)) {
    await prisma.botChat.updateMany({ where: { chatId }, data: { canWrite: false } });
  }
}

/**
 * The chat's row for a message from a group or channel: created on the first
 * message from a chat the bot sat in before this table existed; the title and
 * handle follow renames. Returns whether the chat is quiet.
 */
export async function botChatState(chat: TgChat): Promise<{ quiet: boolean; canWrite: boolean }> {
  const chatId = String(chat.id);
  const title = chat.title?.slice(0, 200) ?? null;
  const username = chat.username?.slice(0, 64) ?? null;
  const row = await prisma.botChat.findUnique({
    where: { chatId },
    select: { quiet: true, canWrite: true, title: true, username: true, removedAt: true },
  });
  if (!row) {
    const created = await prisma.botChat.upsert({
      where: { chatId },
      create: { chatId, title, username },
      update: {},
      select: { quiet: true, canWrite: true },
    });
    return created;
  }
  // A message from the chat means the bot is in it.
  if (row.title !== title || row.username !== username || row.removedAt) {
    await prisma.botChat.update({
      where: { chatId },
      data: { title, username, removedAt: null },
    });
  }
  return { quiet: row.quiet, canWrite: row.canWrite };
}

export type SlotResult = 'ok' | 'quiet' | 'cannot_write' | 'limited';

/** Thrown inside the slot transaction to roll it back with a reason. */
class SlotRefused extends Error {
  constructor(readonly result: Exclude<SlotResult, 'ok'> | 'none') {
    super(result);
  }
}

/**
 * Takes one of the chat's messages for now inside `tx`, or throws SlotRefused.
 * The daily counter is incremented first: that UPDATE locks the chat's row
 * until the transaction ends, so two webhooks for one chat count the hour one
 * after the other. `exceptOrderId`: a follow-up just claimed by this
 * transaction is not counted against itself.
 */
async function claimReplySlot(
  tx: Prisma.TransactionClient,
  chatId: string,
  now: Date,
  exceptOrderId?: string,
): Promise<void> {
  const chat = await tx.botChat.findUnique({
    where: { chatId },
    select: { quiet: true, canWrite: true, removedAt: true },
  });
  // An unknown chat is treated as quiet: no reply without a row to respect.
  if (!chat || chat.quiet) throw new SlotRefused('quiet');
  if (!chat.canWrite || chat.removedAt) throw new SlotRefused('cannot_write');
  // The daily counter starts over each Moscow day. NULL needs its own branch:
  // `repliesDay <> day` is not true for NULL in SQL.
  const day = moscowDateKey(now);
  await tx.botChat.updateMany({
    where: { chatId, OR: [{ repliesDay: null }, { repliesDay: { not: day } }] },
    data: { repliesDay: day, repliesToday: 0 },
  });
  const claimed = await tx.botChat.updateMany({
    where: { chatId, quiet: false, repliesDay: day, repliesToday: { lt: REPLY_LIMITS.perDay } },
    data: { repliesToday: { increment: 1 } },
  });
  if (claimed.count === 0) throw new SlotRefused('limited');
  // Every message counts: a reply and a follow-up in one hour are two.
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const replies = await tx.botReply.count({ where: { chatId, createdAt: { gte: hourAgo } } });
  const followUps = await tx.botReply.count({
    where: {
      chatId,
      followUpAt: { gte: hourAgo },
      ...(exceptOrderId ? { orderId: { not: exceptOrderId } } : {}),
    },
  });
  if (replies + followUps >= REPLY_LIMITS.perHour) throw new SlotRefused('limited');
}

/** Runs `fn` in a transaction; a SlotRefused rolls it back and gives its reason. */
async function withSlot(
  fn: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<'ok' | SlotRefused['result']> {
  try {
    await prisma.$transaction(fn);
    return 'ok';
  } catch (error) {
    if (error instanceof SlotRefused) return error.result;
    throw error;
  }
}

/** A message that was not sent gives its daily slot back. */
async function releaseSlot(tx: Prisma.TransactionClient, chatId: string, now: Date) {
  await tx.botChat.updateMany({
    where: { chatId, repliesDay: moscowDateKey(now), repliesToday: { gt: 0 } },
    data: { repliesToday: { decrement: 1 } },
  });
}

export type ReplyResult = SlotResult | 'sent' | 'failed' | 'not_group';

/**
 * The public reply under an order message. The caller makes sure the order
 * was just created and published (not a duplicate, not PENDING_REVIEW).
 */
export async function replyUnderOrder(
  message: TgGroupMessage,
  orderId: string,
  now: Date = new Date(),
): Promise<ReplyResult> {
  if (!isGroupChat(message.chat.type)) return 'not_group';
  const chatId = String(message.chat.id);
  const threadId = message.is_topic_message ? (message.message_thread_id ?? null) : null;
  // The slot and the row together: the follow-up and the hourly limit rely on it.
  const slot = await withSlot(async (tx) => {
    await claimReplySlot(tx, chatId, now);
    await tx.botReply.create({
      data: { orderId, chatId, messageId: message.message_id, threadId, createdAt: now },
    });
  });
  if (slot !== 'ok') return slot === 'none' ? 'limited' : slot;
  const res = await send(chatId, replyText(orderLink(orderId, campaignFor(message.chat))), {
    messageId: message.message_id,
    threadId,
  });
  if (res.ok) return 'sent';
  // No answer (a timeout): Telegram may have posted it, so it keeps counting.
  if (res.error_code == null) return 'failed';
  await noteRefusal(chatId, res);
  await prisma.$transaction(async (tx) => {
    await tx.botReply.deleteMany({ where: { orderId } });
    await releaseSlot(tx, chatId, now);
  });
  return 'failed';
}

export type FollowUpResult = ReplyResult | 'none';

/**
 * One follow-up per order in the chat thread, when providers have bid: «По
 * заявке уже N предложений». Only for orders the bot answered; quiet chats
 * and the limits apply as to replies.
 */
export async function followUpOnBid(
  orderId: string,
  now: Date = new Date(),
): Promise<FollowUpResult> {
  const row = await prisma.botReply.findUnique({ where: { orderId } });
  if (!row || row.followUpAt) return 'none';
  const bids = await prisma.bid.count({ where: { orderId, status: { not: 'REJECTED' } } });
  if (bids === 0) return 'none';
  // Two bids at once: only one transaction claims the follow-up.
  const slot = await withSlot(async (tx) => {
    const claimed = await tx.botReply.updateMany({
      where: { orderId, followUpAt: null },
      data: { followUpAt: now },
    });
    if (claimed.count === 0) throw new SlotRefused('none');
    await claimReplySlot(tx, row.chatId, now, orderId);
  });
  if (slot !== 'ok') return slot;
  const chat = await prisma.botChat.findUnique({
    where: { chatId: row.chatId },
    select: { username: true },
  });
  const link = orderLink(orderId, campaignFor({ id: row.chatId, username: chat?.username }));
  const res = await send(row.chatId, followUpText(bids, link), {
    messageId: row.messageId,
    threadId: row.threadId,
  });
  if (res.ok) return 'sent';
  // No answer (a timeout): Telegram may have posted it, so no second try.
  if (res.error_code == null) return 'failed';
  await noteRefusal(row.chatId, res);
  // Not sent: the next bid may try again, unless the order message is gone.
  const gone = orderMessageGone(res);
  await prisma.$transaction(async (tx) => {
    if (!gone) await tx.botReply.updateMany({ where: { orderId }, data: { followUpAt: null } });
    await releaseSlot(tx, row.chatId, now);
  });
  return 'failed';
}

/** Telegram's @GroupAnonymousBot, the sender of an anonymous admin's messages. */
export const ANONYMOUS_ADMIN_BOT_ID = 1087968824;

/** The author is an admin of the chat (asked from Telegram, never assumed). */
export async function isChatAdmin(message: TgGroupMessage): Promise<boolean> {
  // An anonymous admin writes on behalf of the group; a channel post is the
  // channel's own (only its admins can post).
  if (message.sender_chat?.id === message.chat.id) return true;
  const userId = message.from?.id;
  if (!userId || message.from?.is_bot) return false;
  const member = await telegramRequest<{ status?: string }>('getChatMember', {
    chat_id: message.chat.id,
    user_id: userId,
  });
  const status = member.ok ? member.result?.status : undefined;
  return status === 'creator' || status === 'administrator';
}

export type CommandResult = 'done' | 'not_admin' | 'limited';

/** /quiet, /resume and /about in a group: for the chat's admins only. */
export async function handleGroupCommand(
  message: TgGroupMessage,
  command: GroupCommand,
): Promise<CommandResult> {
  const chatId = String(message.chat.id);
  // Each command costs a getChatMember call: a flood is cut short.
  if (!checkRateLimit(`tg-group-cmd:${chatId}`, { limit: 10, windowMs: 60_000 }).ok) {
    return 'limited';
  }
  // Non-admins get no answer at all: nothing to argue with in the chat.
  if (!(await isChatAdmin(message))) return 'not_admin';
  if (command !== 'about') {
    const quiet = command === 'quiet';
    const title = message.chat.title?.slice(0, 200) ?? null;
    await prisma.botChat.upsert({
      where: { chatId },
      create: { chatId, title, username: message.chat.username ?? null, quiet },
      // An admin's /resume also clears a refusal the bot remembered.
      update: { quiet, removedAt: null, ...(quiet ? {} : { canWrite: true }) },
    });
  }
  const text = command === 'quiet' ? QUIET_TEXT : command === 'resume' ? RESUME_TEXT : aboutText();
  // Channels get no answer post: only groups have a thread to reply in.
  if (isGroupChat(message.chat.type)) {
    const threadId = message.is_topic_message ? message.message_thread_id : undefined;
    const res = await send(chatId, text, { messageId: message.message_id, threadId });
    if (!res.ok) await noteRefusal(chatId, res);
  }
  return 'done';
}

export interface MyChatMemberUpdate {
  chat: TgChat;
  new_chat_member: { status: string; is_member?: boolean; can_send_messages?: boolean };
  old_chat_member: { status: string; is_member?: boolean };
}

const inChat = (member: { status: string; is_member?: boolean }) =>
  member.status === 'member' ||
  member.status === 'administrator' ||
  member.status === 'creator' ||
  (member.status === 'restricted' && member.is_member !== false);

/** The bot added to a group or channel, removed from it, or its rights changed. */
export async function onMyChatMember(
  update: MyChatMemberUpdate,
  now: Date = new Date(),
): Promise<'added' | 'removed' | 'changed' | 'ignored'> {
  // In a private chat this is a person blocking or unblocking the bot.
  if (update.chat.type === 'private') return 'ignored';
  const chatId = String(update.chat.id);
  const title = update.chat.title?.slice(0, 200) ?? null;
  const username = update.chat.username?.slice(0, 64) ?? null;
  const was = inChat(update.old_chat_member);
  const is = inChat(update.new_chat_member);
  if (is) {
    const member = update.new_chat_member;
    const canWrite = !(member.status === 'restricted' && member.can_send_messages === false);
    // A chat that said /quiet before stays quiet when the bot comes back.
    await prisma.botChat.upsert({
      where: { chatId },
      create: { chatId, title, username, canWrite },
      update: { title, username, canWrite, removedAt: null, ...(was ? {} : { addedAt: now }) },
    });
    if (was) return 'changed';
    await notifyTelegram(`Бот добавлен в чат: ${title ?? chatId}`);
    // One short hello so members and admins know what the bot does and how
    // to switch it off; no reply-to, no notification.
    if (canWrite && isGroupChat(update.chat.type)) {
      const state = await prisma.botChat.findUnique({ where: { chatId }, select: { quiet: true } });
      if (!state?.quiet) {
        const res = await send(chatId, aboutText());
        if (!res.ok) await noteRefusal(chatId, res);
      }
    }
    return 'added';
  }
  if (!was) return 'ignored';
  await prisma.botChat.updateMany({
    where: { chatId },
    data: { removedAt: now, canWrite: false, title, username },
  });
  await notifyTelegram(`Бот удалён из чата: ${title ?? chatId}`);
  return 'removed';
}

/** A group upgraded to a supergroup gets a new id: the chat's choices move with it. */
export async function onChatMigrated(oldChatId: number, newChatId: number): Promise<void> {
  const old = await prisma.botChat.findUnique({ where: { chatId: String(oldChatId) } });
  if (!old) return;
  await prisma.botChat.upsert({
    where: { chatId: String(newChatId) },
    create: {
      chatId: String(newChatId),
      title: old.title,
      username: old.username,
      quiet: old.quiet,
      addedAt: old.addedAt,
    },
    update: { quiet: old.quiet },
  });
  await prisma.botChat.update({
    where: { chatId: String(oldChatId) },
    data: { removedAt: new Date(), canWrite: false },
  });
  // The owner's pick for the daily post follows the chat to its new id.
  await prisma.appSetting.updateMany({
    where: { key: CHANNEL_CHAT_KEY, value: String(oldChatId) },
    data: { value: String(newChatId) },
  });
}

/** For /admin: the chats the bot is in, the latest first. */
export async function loadBotChats(take = 50) {
  const [chats, active] = await Promise.all([
    prisma.botChat.findMany({
      orderBy: [{ removedAt: { sort: 'asc', nulls: 'first' } }, { addedAt: 'desc' }],
      take,
    }),
    prisma.botChat.count({ where: { removedAt: null } }),
  ]);
  return { chats, active };
}
