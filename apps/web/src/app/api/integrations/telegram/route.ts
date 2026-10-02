import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { directMessageLead, leadReply, needsLead } from '@/lib/botDirectMessage';
import { ingestMessage, type IngestResult } from '@/lib/ingest';
import { acceptLead } from '@/lib/leadIntake';
import { notifyTelegram } from '@/lib/notify';
import { safeEqual, telegramWebhookSecret } from '@/lib/integrations';
import {
  completeTelegramLink,
  isStopCommand,
  parseStartToken,
  unlinkTelegramChat,
} from '@/lib/notifications/telegramLink';
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
  // Notifications: "/start <token>" from the deep link in the cabinet links
  // this chat to the account; "/stop" switches the messages off.
  const linkToken = isPrivate ? parseStartToken(text) : null;
  if (linkToken) {
    const linked = await completeTelegramLink(linkToken, message.chat.id).catch(() => false);
    await reply(
      message.chat.id,
      linked
        ? `Готово! Уведомления ${SITE.name} будут приходить сюда: новые заявки, предложения, ` +
            `брони. Отключить — /stop или в личном кабинете.`
        : 'Ссылка устарела или уже использована. Нажмите «Подключить Telegram» в личном кабинете ещё раз.',
    );
    return NextResponse.json({ ok: true, linked });
  }
  if (isPrivate && isStopCommand(text)) {
    const count = await unlinkTelegramChat(message.chat.id).catch(() => 0);
    await reply(
      message.chat.id,
      count > 0
        ? 'Уведомления в Telegram отключены. Включить снова — в личном кабинете.'
        : 'Этот чат не подключён к уведомлениям.',
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
  const incoming = {
    source: 'TELEGRAM' as const,
    externalId: `telegram:${message.chat.id}:${message.message_id}`,
    text,
    chatTitle: isPrivate ? 'Личное сообщение боту' : message.chat.title,
    openChat: !isPrivate,
    authorName: [author, username].filter(Boolean).join(' ') || undefined,
    authorPhone: message.contact?.phone_number,
    url: message.chat.username
      ? `https://t.me/${message.chat.username}/${message.message_id}`
      : undefined,
  };

  // Groups: a failure is retried by Telegram (non-200), nothing to answer.
  if (!isPrivate) {
    const result = await ingestMessage(incoming);
    return NextResponse.json({ ok: true, result: result.status });
  }

  let result: IngestResult | null = null;
  try {
    result = await ingestMessage(incoming);
  } catch (error) {
    console.error('[telegram] could not import a private message', error);
  }

  if (result?.status === 'created') {
    await reply(
      message.chat.id,
      `Спасибо! Заявка принята${result.published ? `: ${siteUrl()}/orders/${result.orderId}` : ''}. ` +
        `Мы свяжемся с вами. Срочно — ${SITE.phone}`,
    );
    return NextResponse.json({ ok: true, result: result.status });
  }
  if (!needsLead(result)) return NextResponse.json({ ok: true, result: result?.status });

  // Not an equipment request, or the database is down: the person still wants
  // to talk to us — save it as a "call me back" lead and tell the owner.
  const lead = directMessageLead({
    channel: 'telegram',
    text,
    authorName: author || undefined,
    username: username || undefined,
    phone: message.contact?.phone_number,
    chatId: message.chat.id,
  });
  const outcome = await acceptLead(lead, {
    save: (data) => prisma.lead.create({ data }),
    notify: notifyTelegram,
    siteName: SITE.name,
    onSaveError: (error) => console.error('[telegram] lead was not saved to the database', error),
  });
  await reply(message.chat.id, leadReply(lead, SITE.phone, outcome !== 'lost'));
  return NextResponse.json({ ok: true, result: result?.status ?? 'error', lead: outcome });
}
