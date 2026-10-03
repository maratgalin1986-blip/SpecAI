import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { directMessageLead, leadReply, needsLead } from '@/lib/botDirectMessage';
import { ingestMessage, type IngestResult } from '@/lib/ingest';
import { acceptLead } from '@/lib/leadIntake';
import { notifyTelegram } from '@/lib/notify';
import { safeEqual, telegramWebhookSecret } from '@/lib/integrations';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import { isOnShift } from '@/lib/site';
import {
  acceptedText,
  askPhoneText,
  calcText,
  CONTACT_KEYBOARD,
  draftMessage,
  greeting,
  leadSource,
  machineKeyboard,
  parseCalcStart,
  parseCallback,
  phoneFromText,
  PLACE_TEXT,
  placeKeyboard,
  shortSource,
  UNSUBSCRIBE,
  UNSUBSCRIBED_TEXT,
  whenKeyboard,
  whenText,
} from '@/lib/botFunnel';
import { attachPhone, findDraft, sendDueReminders, unsubscribe } from '@/lib/botDrafts';
import { telegramApi } from '@/lib/telegramApi';

export const dynamic = 'force-dynamic';

interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: { first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
  contact?: { phone_number?: string };
}

async function reply(chatId: number, text: string, markup?: unknown) {
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}

interface CallbackQuery {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; last_name?: string; username?: string };
  message?: { chat: { id: number; type: string } };
}

/** The order funnel's buttons: machine → when → where → phone (lib/botFunnel.ts). */
async function onCallback(query: CallbackQuery) {
  await telegramApi('answerCallbackQuery', { callback_query_id: query.id });
  const chatId = query.message?.chat.id;
  if (!chatId || query.message?.chat.type !== 'private') return;
  const step = parseCallback(query.data);
  if (!step) return;
  if (step.step === 'unsubscribe') {
    await unsubscribe(chatId);
    await reply(chatId, UNSUBSCRIBED_TEXT, { remove_keyboard: true });
    return;
  }
  if (step.step === 'machine') {
    await reply(chatId, whenText(step.machine), whenKeyboard(step.machine, step.src));
    return;
  }
  if (step.step === 'when') {
    await reply(chatId, PLACE_TEXT, placeKeyboard(step.machine, step.when, step.src));
    return;
  }
  const name =
    [query.from.first_name, query.from.last_name].filter(Boolean).join(' ') ||
    (query.from.username ? `@${query.from.username}` : 'Из Telegram');
  try {
    await prisma.lead.create({
      data: { name, phone: '', message: draftMessage(step, chatId), source: leadSource(step.src) },
    });
  } catch (error) {
    console.error('[telegram] draft lead not saved', error);
  }
  await reply(chatId, askPhoneText(step), CONTACT_KEYBOARD);
  await reply(chatId, 'Передумали — можно отписаться:', { inline_keyboard: [[UNSUBSCRIBE]] });
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
    callback_query?: CallbackQuery;
  } | null;
  // Due reminders ride on any incoming update (and on the hourly cron).
  await sendDueReminders().catch((error) => console.error('[telegram] reminders', error));
  if (update?.callback_query) {
    await onCallback(update.callback_query);
    return NextResponse.json({ ok: true });
  }
  const message = update?.message ?? update?.channel_post;
  // A shared contact (or a typed phone) completes a draft from the funnel.
  if (message && message.chat.type === 'private' && !message.from?.is_bot) {
    const phone =
      message.contact?.phone_number ??
      (message.text && !message.text.startsWith('/') ? phoneFromText(message.text) : null);
    if (phone) {
      const draft = await findDraft(message.chat.id).catch(() => null);
      if (draft) {
        await attachPhone(draft, phone);
        await reply(message.chat.id, acceptedText(isOnShift()), { remove_keyboard: true });
        return NextResponse.json({ ok: true, result: 'funnel-lead' });
      }
    }
  }
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
    // «/start <source>»: the page and campaign the visitor came from.
    const start = text.split(/\s+/)[1] ?? '';
    const src = shortSource(start);
    const calc = parseCalcStart(start);
    if (calc) {
      await reply(message.chat.id, calcText(calc.machine, calc.hours));
      await reply(message.chat.id, whenText(calc.machine), whenKeyboard(calc.machine, src));
    } else {
      await reply(message.chat.id, greeting(), machineKeyboard(src));
    }
    return NextResponse.json({ ok: true });
  }

  const author = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ');
  const username = message.from?.username ? `@${message.from.username}` : '';
  const incoming = {
    source: 'TELEGRAM' as const,
    externalId: `telegram:${message.chat.id}:${message.message_id}`,
    text,
    chatTitle: isPrivate ? 'Личное сообщение боту' : message.chat.title,
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
