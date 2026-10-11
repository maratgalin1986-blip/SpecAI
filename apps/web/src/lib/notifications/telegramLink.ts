// Linking a user's Telegram to their account: the site gives a deep link
// https://t.me/<bot>?start=n_<one-time token>; the bot webhook receives
// "/start n_<token>" in the private chat and stores the chat id. Only the
// sha256 of the token is kept, and it expires after LINK_TTL_MS.
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@specai/database';

export const LINK_TTL_MS = 15 * 60_000;

/**
 * Marks the notification deep link, so other /start payloads (the bot funnel's
 * page and campaign source) are never taken for a token.
 */
const LINK_PREFIX = 'n_';

/** A fresh token: 32 url-safe characters (Telegram allows A-Z a-z 0-9 _ - up to 64). */
export function newLinkToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The token of "/start n_<token>" (also "/start@bot n_<token>"), or null for a
 * plain /start, a deep link of another kind, or any other message.
 */
export function parseStartToken(text: string): string | null {
  const match = /^\/start(?:@\w+)?\s+n_([A-Za-z0-9_-]{16,62})\s*$/.exec(text.trim());
  return match ? match[1]! : null;
}

/** "/stop" in the private chat switches the Telegram notifications off. */
export function isStopCommand(text: string): boolean {
  return /^\/stop(@\w+)?\s*$/.test(text.trim());
}

export function deepLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${LINK_PREFIX}${token}`;
}

let cachedBotUsername: string | null = null;

/** NEXT_PUBLIC_TELEGRAM_BOT, or asked from Telegram once (getMe) with the bot token. */
export async function botUsername(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_TELEGRAM_BOT?.trim().replace(/^@/, '');
  if (configured) return configured;
  if (cachedBotUsername) return cachedBotUsername;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as { ok?: boolean; result?: { username?: string } };
    cachedBotUsername = body.ok ? (body.result?.username ?? null) : null;
    return cachedBotUsername;
  } catch {
    return null;
  }
}

/** Creates a one-time link for the user; null when the bot is not set up. */
export async function startTelegramLink(userId: string) {
  const username = await botUsername();
  if (!username) return null;
  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await prisma.notificationSettings.upsert({
    where: { userId },
    update: { telegramLinkHash: hashLinkToken(token), telegramLinkExpiresAt: expiresAt },
    create: { userId, telegramLinkHash: hashLinkToken(token), telegramLinkExpiresAt: expiresAt },
  });
  return { url: deepLink(username, token), expiresAt };
}

/** "/start <token>" arrived from `chatId`: links the chat. Returns whether it matched. */
export async function completeTelegramLink(token: string, chatId: number | string) {
  const { count } = await prisma.notificationSettings.updateMany({
    where: { telegramLinkHash: hashLinkToken(token), telegramLinkExpiresAt: { gt: new Date() } },
    data: {
      telegramChatId: String(chatId),
      telegram: true,
      telegramLinkHash: null,
      telegramLinkExpiresAt: null,
    },
  });
  return count > 0;
}

export async function unlinkTelegram(userId: string) {
  await prisma.notificationSettings.updateMany({
    where: { userId },
    data: { telegramChatId: null, telegramLinkHash: null, telegramLinkExpiresAt: null },
  });
}

/** "/stop" from a chat: every account linked to it stops getting Telegram messages. */
export async function unlinkTelegramChat(chatId: number | string) {
  const { count } = await prisma.notificationSettings.updateMany({
    where: { telegramChatId: String(chatId) },
    data: { telegramChatId: null },
  });
  return count;
}
