// «Заявки на спецтехнику за сутки»: once a day the daily cron posts the
// orders of the last 24 hours to the platform's OWN Telegram channel. The
// owner creates the channel, adds the bot (TELEGRAM_BOT_TOKEN) as an admin and
// sets TELEGRAM_CHANNEL_ID (the @username or the numeric id); without it
// nothing is posted. Never into anyone else's chat.
//
// Honest by design: only real orders placed on the platform (the site, the
// app, the guest form) that are still open; no post at all on a day without
// any — never filler. Each line names the kind of machine, the city and the
// day (lib/orderCard.ts), nothing else: no names, phones, addresses,
// descriptions or bid prices. Orders found in other people's chats are left
// out — their authors wrote to that chat, not to our channel.
import { prisma } from '@specai/database';
import { onceADay } from './cronOnce';
import { categoryEmoji } from './orderBoard';
import { orderCardText, orderShareUrl, type OrderCardInput } from './orderCard';
import { siteUrl } from './siteUrl';
import { telegramApi } from './telegramApi';

export const CHANNEL_JOB = 'channel-digest';
export const CHANNEL_MAX_ORDERS = 10;
export const CHANNEL_TITLE = 'Заявки на спецтехнику за сутки';
const DAY_MS = 86_400_000;

export interface ChannelOrderRow {
  id: string;
  desiredStartDate: Date;
  category: { name: string } | null;
  location: OrderCardInput['location'];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The provider sign-up link for the footer, tagged for /admin «Маркетинг». */
export function channelProviderLink(base: string): string {
  return `${base}/register?type=provider&utm_source=telegram&utm_medium=channel`;
}

/**
 * The post (Telegram HTML), or null when there is nothing to post. `total`
 * is how many orders the day had; above CHANNEL_MAX_ORDERS a line leads to
 * the board.
 */
export function channelDigestText(
  rows: ChannelOrderRow[],
  base: string,
  total = rows.length,
): string | null {
  const shown = rows.slice(0, CHANNEL_MAX_ORDERS);
  if (shown.length === 0) return null;
  const items = shown.map((row) => {
    const card = orderCardText({
      categoryName: row.category?.name,
      location: row.location,
      desiredStartDate: row.desiredStartDate,
    });
    const link = orderShareUrl(base, row.id, 'telegram', 'channel');
    return `${categoryEmoji(row.category?.name)} ${escapeHtml(card.line)}\n<a href="${escapeHtml(link)}">Открыть заявку</a>`;
  });
  const more = Math.max(0, total - shown.length);
  const board = `${base}/orders?utm_source=telegram&utm_medium=channel`;
  return [
    `<b>${CHANNEL_TITLE}</b>`,
    ...items,
    ...(more > 0 ? [`И ещё ${more} — <a href="${escapeHtml(board)}">все заявки</a>`] : []),
    `Исполнители — выходите на линию в приложении: ${escapeHtml(channelProviderLink(base))}`,
  ].join('\n\n');
}

/** The open orders placed on the platform in the 24 hours before `now`. */
export async function loadChannelOrders(
  now: Date,
): Promise<{ rows: ChannelOrderRow[]; total: number }> {
  const where = {
    status: 'OPEN' as const,
    source: 'SITE' as const,
    createdAt: { gte: new Date(now.getTime() - DAY_MS), lte: now },
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        desiredStartDate: true,
        category: { select: { name: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: CHANNEL_MAX_ORDERS,
    }),
    prisma.order.count({ where }),
  ]);
  return { rows, total };
}

export type ChannelDigestResult =
  { posted: number } | { skipped: 'off' | 'preview' | 'already posted today' };

/**
 * Posts the day's orders to the channel, once per Moscow day (lib/cronOnce.ts).
 * A rejected post throws inside the claim, so a retry the same day can send
 * it; the caller (the daily cron) catches.
 */
export async function postChannelDigest(now: Date = new Date()): Promise<ChannelDigestResult> {
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return { skipped: 'off' };
  // Previews share the bot and the database settings: never post from them.
  if (process.env.VERCEL_ENV === 'preview') return { skipped: 'preview' };
  const result = await onceADay(
    CHANNEL_JOB,
    async () => {
      const { rows, total } = await loadChannelOrders(now);
      const text = channelDigestText(rows, siteUrl(), total);
      if (!text) return { posted: 0 };
      const ok = await telegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      if (!ok) throw new Error('Telegram did not accept the channel post');
      return { posted: rows.length };
    },
    now,
  );
  return result ?? { skipped: 'already posted today' };
}
