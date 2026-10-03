// Draft leads of the bot funnel (lib/botFunnel.ts) in the Lead table: saved at
// step 3 with an empty phone, completed when the person shares the number,
// reminded once an hour later, never again; «Отписаться» stops the reminder.

import { prisma, type Lead } from '@specai/database';
import {
  chatMark,
  CONTACT_KEYBOARD,
  DRAFT_MARK,
  REMINDED_MARK,
  reminderText,
  UNSUBSCRIBE,
  UNSUB_MARK,
} from '@/lib/botFunnel';
import { leadMessage } from '@/lib/leadIntake';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
import { telegramApi } from '@/lib/telegramApi';
import { parseStart } from '@/lib/telegram';

const HOUR = 3_600_000;

export function findDraft(chatId: number) {
  return prisma.lead.findFirst({
    where: {
      phone: '',
      message: { contains: chatMark(chatId) },
      createdAt: { gte: new Date(Date.now() - 48 * HOUR) },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Readable origin for the owner: «arenda-samosval · кампания direct-kran · yclid 123». */
export function sourceLine(source: string | null) {
  const raw = (source ?? '').replace(/^tg-bot:/, '');
  const { page, campaign, yclid } = parseStart(raw);
  return [
    `Telegram-бот, страница ${page || 'бот'}`,
    campaign ? `кампания ${campaign}` : null,
    yclid ? `yclid ${yclid}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const clean = (message: string | null) =>
  (message ?? '')
    .replace(DRAFT_MARK, '')
    .replace(REMINDED_MARK, '')
    .replace(UNSUB_MARK, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Saves the chat's draft: updates the open one instead of adding rows, so
 * repeated button presses never pile up leads. An earlier «Отписаться» in
 * this chat carries over to the new draft (no reminder then).
 */
export async function saveDraft(chatId: number, message: string, source: string) {
  const [open, unsubscribed] = await Promise.all([
    findDraft(chatId),
    prisma.lead.findFirst({
      where: {
        AND: [{ message: { contains: chatMark(chatId) } }, { message: { contains: UNSUB_MARK } }],
      },
      select: { id: true },
    }),
  ]);
  const text = unsubscribed ? `${message} ${UNSUB_MARK}` : message;
  if (open) {
    await prisma.lead.update({ where: { id: open.id }, data: { message: text, source } });
  } else {
    await prisma.lead.create({ data: { name: 'Из Telegram', phone: '', message: text, source } });
  }
}

/** Completes the draft with the phone and tells the owner at once. */
export async function attachPhone(draft: Lead, phone: string, name: string) {
  const message = clean(draft.message);
  const who = name.slice(0, 100);
  await prisma.lead.update({
    where: { id: draft.id },
    data: { phone: phone.slice(0, 30), message, name: who },
  });
  // Any other empty drafts of this chat are placeholders: gone, never reminded.
  const chatId = Number(/\[tg:(-?\d+)\]/.exec(draft.message ?? '')?.[1]);
  if (chatId) {
    await prisma.lead.deleteMany({
      where: { phone: '', message: { contains: chatMark(chatId) }, NOT: { id: draft.id } },
    });
  }
  await notifyTelegram(
    leadMessage(
      { name: who, phone, message, source: `${draft.source} (${sourceLine(draft.source)})` },
      SITE.name,
      true,
    ),
  );
}

export async function unsubscribe(chatId: number) {
  const drafts = await prisma.lead.findMany({
    where: { phone: '', message: { contains: chatMark(chatId) } },
    select: { id: true, message: true },
  });
  for (const d of drafts) {
    if (d.message?.includes(UNSUB_MARK)) continue;
    await prisma.lead.update({
      where: { id: d.id },
      data: { message: `${d.message} ${UNSUB_MARK}` },
    });
  }
}

/** One reminder per abandoned draft, an hour after it, within a day. */
export async function sendDueReminders(now = Date.now()) {
  const due = await prisma.lead.findMany({
    where: {
      phone: '',
      message: { contains: DRAFT_MARK },
      createdAt: { lte: new Date(now - HOUR), gte: new Date(now - 24 * HOUR) },
      NOT: [{ message: { contains: REMINDED_MARK } }, { message: { contains: UNSUB_MARK } }],
    },
    take: 20,
    select: { id: true, message: true },
  });
  let sent = 0;
  for (const d of due) {
    const chatId = Number(/\[tg:(-?\d+)\]/.exec(d.message ?? '')?.[1]);
    // Claimed atomically before sending: of two parallel runs (webhook and
    // cron) only the one that marks the row sends — never two reminders.
    const claimed = await prisma.lead.updateMany({
      where: { id: d.id, NOT: { message: { contains: REMINDED_MARK } } },
      data: { message: `${d.message} ${REMINDED_MARK}` },
    });
    if (claimed.count !== 1 || !chatId) continue;
    const ok = await telegramApi('sendMessage', {
      chat_id: chatId,
      text: reminderText(d.message ?? ''),
      reply_markup: CONTACT_KEYBOARD,
    });
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: 'Не нужно — отпишитесь:',
      reply_markup: { inline_keyboard: [[UNSUBSCRIBE]] },
    });
    if (ok) sent++;
  }
  return sent;
}
