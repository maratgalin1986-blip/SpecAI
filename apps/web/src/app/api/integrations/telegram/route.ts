import { NextRequest, NextResponse } from 'next/server';
import { ingestMessage } from '@/lib/ingest';
import { safeEqual, telegramWebhookSecret } from '@/lib/integrations';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: { first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
  contact?: { phone_number?: string };
}

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}

// Telegram bot webhook: messages from groups/channels the bot is in, and
// private messages to the bot, become orders on the bidding board.
export async function POST(request: NextRequest) {
  const expected = telegramWebhookSecret();
  if (!expected || !safeEqual(request.headers.get('x-telegram-bot-api-secret-token'), expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as {
    message?: TelegramMessage;
    channel_post?: TelegramMessage;
  } | null;
  const message = update?.message ?? update?.channel_post;
  const text = message?.text ?? message?.caption;
  // Always answer 200 so Telegram doesn't retry messages we deliberately skip.
  if (!message || !text || message.from?.is_bot) return NextResponse.json({ ok: true });

  const isPrivate = message.chat.type === 'private';
  // Tells the owner which value to put into TELEGRAM_CHAT_ID (works in a
  // private chat or, as an explicit command, in a group).
  if (/^\/id(@\w+)?(\s|$)/.test(text)) {
    await reply(
      message.chat.id,
      `ID этого чата: ${message.chat.id}\nУкажите его в TELEGRAM_CHAT_ID.`,
    );
    return NextResponse.json({ ok: true });
  }
  if (isPrivate && text.startsWith('/start')) {
    await reply(
      message.chat.id,
      `Здравствуйте! Это бот ${SITE.name}. Напишите, какая техника нужна, где и когда — ` +
        `заявка придёт напрямую в ${SITE.name}, мы перезвоним. Телефон: ${SITE.phone}`,
    );
    return NextResponse.json({ ok: true });
  }

  const author = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ');
  const username = message.from?.username ? `@${message.from.username}` : '';
  const result = await ingestMessage({
    source: 'TELEGRAM',
    externalId: `telegram:${message.chat.id}:${message.message_id}`,
    text,
    chatTitle: isPrivate ? 'Личное сообщение боту' : message.chat.title,
    authorName: [author, username].filter(Boolean).join(' ') || undefined,
    authorPhone: message.contact?.phone_number,
    url: message.chat.username
      ? `https://t.me/${message.chat.username}/${message.message_id}`
      : undefined,
  });

  // Only answer in private chats — never post into groups.
  if (isPrivate) {
    await reply(
      message.chat.id,
      result.status === 'created'
        ? `Спасибо! Заявка принята${result.published ? `: ${siteUrl()}/orders/${result.orderId}` : ''}. ` +
            `Мы свяжемся с вами. Срочно — ${SITE.phone}`
        : `Не нашли в сообщении, какая техника нужна. Напишите, например: ` +
            `«Нужен экскаватор-погрузчик завтра, Набережные Челны, траншея 20 м». Или звоните ${SITE.phone}`,
    );
  }
  return NextResponse.json({ ok: true, result: result.status });
}
