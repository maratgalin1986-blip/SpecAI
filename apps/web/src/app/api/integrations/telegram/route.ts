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
import { attachPhone, findDraft, saveDraft, sendDueReminders, unsubscribe } from '@/lib/botDrafts';
import { tickDeferredOrderNotices } from '@/lib/deferredOrderNotices';
import { checkRateLimit } from '@/lib/rateLimit';
import { telegramApi } from '@/lib/telegramApi';
import {
  botChatState,
  handleGroupCommand,
  onChatMigrated,
  onMyChatMember,
  parseGroupCommand,
  replyUnderOrder,
  type MyChatMemberUpdate,
} from '@/lib/groupBot';

export const dynamic = 'force-dynamic';

interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  };
  contact?: { phone_number?: string; user_id?: number };
  /** The group itself for an anonymous admin; the channel for a channel post. */
  sender_chat?: { id: number };
  message_thread_id?: number;
  is_topic_message?: boolean;
  /** The group was upgraded to a supergroup with this new id. */
  migrate_to_chat_id?: number;
  /** This supergroup was the group with this id. */
  migrate_from_chat_id?: number;
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
  // A flood of button presses costs nothing: 20 a minute per chat.
  if (!checkRateLimit(`tg-cb:${chatId}`, { limit: 20, windowMs: 60_000 }).ok) return;
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
  // One draft per chat: a second pass through the buttons updates it. No
  // name yet — personal data only after the consent notice at the phone step.
  try {
    await saveDraft(chatId, draftMessage(step, chatId), leadSource(step.src));
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
    my_chat_member?: MyChatMemberUpdate;
  } | null;
  // Due reminders ride on any incoming update (and on the hourly cron).
  await sendDueReminders().catch((error) => console.error('[telegram] reminders', error));
  // So do the delayed new-order alerts of «Пригласи друга».
  await tickDeferredOrderNotices('telegram');
  if (update?.callback_query) {
    await onCallback(update.callback_query);
    return NextResponse.json({ ok: true });
  }
  // The bot added to or removed from a group (lib/groupBot.ts). Errors are
  // logged: Telegram would only retry the same update.
  if (update?.my_chat_member) {
    const result = await onMyChatMember(update.my_chat_member).catch((error) => {
      console.error('[telegram] my_chat_member', error);
      return 'error';
    });
    return NextResponse.json({ ok: true, result });
  }
  const message = update?.message ?? update?.channel_post;
  // A group upgraded to a supergroup: Telegram sends both service messages
  // (old chat «to», new chat «from»). The chat's /quiet must move with it, so
  // a database error asks Telegram to retry (the move is idempotent).
  const migration = message?.migrate_to_chat_id
    ? { from: message.chat.id, to: message.migrate_to_chat_id }
    : message?.migrate_from_chat_id
      ? { from: message.migrate_from_chat_id, to: message.chat.id }
      : null;
  if (migration) {
    try {
      await onChatMigrated(migration.from, migration.to);
    } catch (error) {
      console.error('[telegram] chat migration', error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  // A shared contact (or a typed phone) completes a draft from the funnel.
  if (message && message.chat.type === 'private' && !message.from?.is_bot) {
    // Only the person's own contact counts, not a contact card of someone else.
    const ownContact =
      message.contact && (!message.contact.user_id || message.contact.user_id === message.from?.id)
        ? message.contact.phone_number
        : undefined;
    const phone =
      ownContact ??
      (message.text && !message.text.startsWith('/') ? phoneFromText(message.text) : null);
    if (phone) {
      const draft = await findDraft(message.chat.id).catch(() => null);
      if (draft) {
        const fullName = [message.from?.first_name, message.from?.last_name]
          .filter(Boolean)
          .join(' ');
        await attachPhone(draft, phone, fullName || message.from?.username || 'Из Telegram');
        await reply(message.chat.id, acceptedText(isOnShift()), { remove_keyboard: true });
        return NextResponse.json({ ok: true, result: 'funnel-lead' });
      }
    }
  }
  const text = message?.text ?? message?.caption;
  // A group admin's /quiet, /resume or /about (before the bot check: an
  // anonymous admin writes through Telegram's @GroupAnonymousBot).
  const command =
    message && message.chat.type !== 'private' && parseGroupCommand(text, SITE.telegramBot);
  if (message && command) {
    const result = await handleGroupCommand(message, command).catch((error) => {
      console.error('[telegram] group command', error);
      return 'error';
    });
    return NextResponse.json({ ok: true, result });
  }
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
        ? `Готово! Уведомления ${SITE.platform} от ${SITE.name} будут приходить сюда: новые заявки, предложения, ` +
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
    // «/start <source>»: the page and campaign the visitor came from.
    const start = text.split(/\s+/)[1] ?? '';
    const src = shortSource(start);
    const calc = parseCalcStart(start);
    if (calc) {
      await reply(message.chat.id, calcText(calc.machine, calc.hours, calc.hammer));
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
    openChat: !isPrivate,
    authorName: [author, username].filter(Boolean).join(' ') || undefined,
    authorPhone: message.contact?.phone_number,
    url: message.chat.username
      ? `https://t.me/${message.chat.username}/${message.message_id}`
      : undefined,
  };

  // Groups: a failed import is retried by Telegram (non-200). A published
  // order gets one public reply in the thread; the bot's own failures are
  // logged and never turn into a retry.
  if (!isPrivate) {
    let state: { quiet: boolean } | null = null;
    try {
      state = await botChatState(message.chat);
    } catch (error) {
      console.error('[telegram] chat state', error);
    }
    // The chat's admins said /quiet: neither import nor replies.
    if (state?.quiet) return NextResponse.json({ ok: true, result: 'quiet' });
    const result = await ingestMessage(incoming);
    const reply =
      state && result.status === 'created' && result.published
        ? await replyUnderOrder(message, result.orderId).catch((error) => {
            console.error('[telegram] reply under the order', error);
            return 'error';
          })
        : undefined;
    return NextResponse.json({ ok: true, result: result.status, reply });
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
