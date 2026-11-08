// «Опрос цен в группе» (owner, 2026-10-18: «Опрос сам проведи в группе. Мне
// итоги только.»). Once, from the daily cron, the bot posts in the owner's own
// group ONE survey message (owners of machinery name their machine, city and
// price as a reply to it, or write to the bot in private) and ONE anonymous
// native poll; it pins the message if it may. For 7 days replies to that
// message become PriceReport rows (source «group»; never orders) — the bot
// answers nothing. Then a later daily run unpins, stops the poll and, only
// with ≥ 3 answers, posts one closing line; the results go to the owner's
// private Telegram and to /admin «Опрос цен».
//
// Only the owner's group: the chat picked for the daily post (lib/channelTarget.ts
// loadChannelChatId), else the one and only active chat with the bot; anything
// else — nothing is posted and the owner is told once. These posts are the
// owner's own exception to the «тихий режим» (BotChat.silent); /quiet stops them.

import { prisma } from '@specai/database';
import { categoryName } from '@specai/shared';
import { loadPickedChannelChatId } from './channelTarget';
import { median, rubles } from './priceIndex';
import { reporterHash } from './reporterHash';
import { notifyTelegram } from './notify';
import { parseSurveyAnswer } from './groupSurveyParse';
import { priceSurveyLink } from './botPrices';
import { SITE } from './site';
import { siteUrl } from './siteUrl';
import { telegramRequest } from './telegramApi';
import { checkRateLimit } from './rateLimit';

/** The survey of this deploy; a later one would be «prices.2». */
export const SURVEY_KEY = 'prices.1';
export const SURVEY_SETTING = `survey.${SURVEY_KEY}`;
/** «Не понял, в какую группу» / «бота выключили» — told once. */
export const SURVEY_TOLD_SETTING = `${SURVEY_SETTING}.told`;
export const SURVEY_DAYS = 7;
const SURVEY_MS = SURVEY_DAYS * 86_400_000;
/** The group closing line only with at least this many answers. */
export const SURVEY_MIN_ANSWERS = 3;

export const POLL_QUESTION = 'Сколько вы берёте за час работы техники с машинистом?';
export const POLL_OPTIONS = [
  'до 2 000 ₽',
  '2 000–2 500 ₽',
  '2 500–3 000 ₽',
  '3 000–3 500 ₽',
  '3 500–4 500 ₽',
  'больше 4 500 ₽',
  'нет своей техники',
] as const;

export function surveyMessageText(bot: string = SITE.telegramBot): string {
  const link = priceSurveyLink(bot);
  return (
    '📊 Опрос для владельцев техники. Ответьте на это сообщение: какая у вас техника (марка, ' +
    'модель), в каком городе и почём работаете за час с машинистом. Например: «JCB 3CX, ' +
    'Набережные Челны, 3 000 ₽/ч». Через неделю покажем средние цены по ответам.' +
    (link ? ` Не хотите писать в группе — напишите боту в личку: ${link}` : '') +
    '\nПроголосовать анонимно — в опросе ниже; назвать свою технику и цену — ответом на это ' +
    'сообщение или боту в личку.'
  );
}

export function closingText(answers: number): string {
  return (
    `Спасибо! Ответили ${answers} владельцев техники. Средние цены — на сайте: ${siteUrl()}/ceny ` +
    '(итоги анонимного опроса видны в самом опросе).'
  );
}

export interface PollCount {
  text: string;
  voters: number;
}

export interface SurveyState {
  status: 'posting' | 'open' | 'closed';
  chatId: string;
  title: string | null;
  messageId?: number;
  pollMessageId?: number | null;
  pinned?: boolean;
  postedAt?: string;
  closedAt?: string;
  /** When the «posting» claim was made (a run cut off midway is given up after a while). */
  claimedAt?: string;
  /** False while the owner's summary has not been delivered (the next run retries). */
  summarySent?: boolean;
  /** Undelivered summaries so far; after SUMMARY_TRIES the runs stop trying (it stays in /admin). */
  summaryTries?: number;
  answers?: number;
  poll?: { options: PollCount[]; total: number } | null;
}

function readState(value: string | null | undefined): SurveyState | null {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as SurveyState;
    return state && typeof state.chatId === 'string' ? state : null;
  } catch {
    return null;
  }
}

export async function loadSurveyState(): Promise<SurveyState | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: SURVEY_SETTING } });
  return readState(row?.value);
}

/** Tells the owner once per survey (the same reason is never repeated daily). */
async function tellOwnerOnce(text: string) {
  try {
    await prisma.appSetting.create({
      data: { key: SURVEY_TOLD_SETTING, value: text.slice(0, 200) },
    });
  } catch {
    return false;
  }
  await notifyTelegram(text);
  return true;
}

export const AMBIGUOUS_TEXT =
  'Не понял, в какую группу отправлять опрос: выберите её в /admin → «Чаты с ботом» → «Сводка заявок сюда»';

/**
 * The owner's group: the chat picked in /admin for the daily post (or the one
 * the owner added the bot to, auto-picked there), else the one and only active
 * chat with the bot (not removed, may write, not /quiet). Never the
 * TELEGRAM_CHANNEL_ID channel — a channel post collects no replies. Null for
 * no chat or several: never a guess.
 */
export async function resolveSurveyChat(): Promise<{
  chatId: string;
  title: string | null;
} | null> {
  const picked = await loadPickedChannelChatId();
  if (picked) {
    const chat = await prisma.botChat.findUnique({ where: { chatId: picked } });
    // A stale pick (the bot left, /quiet) is not swapped for another chat:
    // that could be a stranger's group. When the owner adds the bot to his
    // new group himself, autoPickOwnersChat makes it the pick.
    if (!chat || chat.quiet || chat.removedAt || !chat.canWrite) return null;
    return { chatId: picked, title: chat.title ?? null };
  }
  const active = await prisma.botChat.findMany({
    where: { removedAt: null, canWrite: true, quiet: false },
    select: { chatId: true, title: true },
    take: 2,
  });
  return active.length === 1 ? active[0]! : null;
}

export type SurveyRun =
  'posted' | 'open' | 'closed' | 'done' | 'no_chat' | 'failed' | 'busy' | 'stuck';

/** A «posting» claim this old was cut off (the function died): given up, the owner told. */
const STUCK_MS = 6 * 3_600_000;

/** The daily cron's step: posts the survey once, then closes it after 7 days. */
export async function runGroupPriceSurvey(now: Date = new Date()): Promise<SurveyRun> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return 'no_chat';
  const state = await loadSurveyState();
  if (!state) return postSurvey(now);
  if (state.status === 'closed') {
    // The results did not reach the owner last time: try again.
    if (state.summarySent === false) {
      await sendSummary(state);
      return 'closed';
    }
    return 'done';
  }
  if (state.status === 'posting') {
    const claimed = state.claimedAt ? new Date(state.claimedAt).getTime() : 0;
    if (now.getTime() - claimed < STUCK_MS) return 'busy';
    await markClosed(state, now, { summarySent: true });
    await tellOwnerOnce(
      `Опрос цен в «${state.title ?? state.chatId}» мог уйти без отметки: проверьте группу. Повторно бот его не отправит.`,
    );
    return 'stuck';
  }
  if (!state.postedAt) return 'busy';
  if (now.getTime() - new Date(state.postedAt).getTime() < SURVEY_MS) return 'open';
  return closeSurvey(state, now);
}

async function markClosed(state: SurveyState, now: Date, extra: Partial<SurveyState> = {}) {
  await prisma.appSetting.update({
    where: { key: SURVEY_SETTING },
    data: {
      value: JSON.stringify({ ...state, status: 'closed', closedAt: now.toISOString(), ...extra }),
    },
  });
  activeCache = null;
}

async function postSurvey(now: Date): Promise<SurveyRun> {
  const target = await resolveSurveyChat();
  if (!target) {
    await tellOwnerOnce(AMBIGUOUS_TEXT);
    return 'no_chat';
  }
  const claim: SurveyState = {
    status: 'posting',
    chatId: target.chatId,
    title: target.title,
    claimedAt: now.toISOString(),
  };
  // Claimed first: two runs at once post one survey.
  try {
    await prisma.appSetting.create({ data: { key: SURVEY_SETTING, value: JSON.stringify(claim) } });
  } catch {
    return 'busy';
  }
  const sent = await telegramRequest<{ message_id: number }>('sendMessage', {
    chat_id: target.chatId,
    text: surveyMessageText(),
    link_preview_options: { is_disabled: true },
  });
  if (!sent.ok || !sent.result?.message_id) {
    if (sent.timedOut) {
      // No answer in time: Telegram may have posted it. Never a second
      // survey — the owner checks the group.
      await markClosed(claim, now, { summarySent: true });
      await tellOwnerOnce(
        `Telegram не ответил при отправке опроса цен в «${target.title ?? target.chatId}» — проверьте группу. Повторно бот его не отправит.`,
      );
      return 'failed';
    }
    // Refused, or the network failed before Telegram: nothing was posted,
    // the next run may try again (the owner hears once).
    await prisma.appSetting.deleteMany({ where: { key: SURVEY_SETTING } });
    await tellOwnerOnce(
      `Не удалось отправить опрос цен в «${target.title ?? target.chatId}»: ${sent.description ?? 'ошибка Telegram'}. Проверьте, что бот в группе и может писать.`,
    );
    return 'failed';
  }
  const messageId = sent.result.message_id;
  const pin = await telegramRequest('pinChatMessage', {
    chat_id: target.chatId,
    message_id: messageId,
    disable_notification: true,
  });
  const poll = await telegramRequest<{ message_id: number }>('sendPoll', {
    chat_id: target.chatId,
    question: POLL_QUESTION,
    options: POLL_OPTIONS.map((text) => ({ text })),
    is_anonymous: true,
    allows_multiple_answers: false,
    disable_notification: true,
  });
  const open: SurveyState = {
    ...claim,
    status: 'open',
    messageId,
    pollMessageId: poll.ok ? (poll.result?.message_id ?? null) : null,
    pinned: pin.ok,
    postedAt: now.toISOString(),
  };
  // Posted: the state must be saved, or replies are not collected. One retry.
  const save = () =>
    prisma.appSetting.update({
      where: { key: SURVEY_SETTING },
      data: { value: JSON.stringify(open) },
    });
  await save().catch(save);
  activeCache = null;
  return 'posted';
}

interface AnswerRow {
  categorySlug: string | null;
  machineName: string | null;
  city: string | null;
  hourlyRate: number | null;
  shiftRate: number | null;
  authorName: string | null;
  source: string;
  reporterHash: string | null;
  id: string;
}

/** One answer per author (the newest; the rows come newest first). */
export function onePerAuthor<T extends { reporterHash: string | null; id: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.reporterHash ?? row.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TELEGRAM_MAX = 3900;

/** The owner's private summary: counts by type, every answer, the anonymous poll. */
export function surveySummary(input: {
  title: string | null;
  answers: AnswerRow[];
  poll: { options: PollCount[]; total: number } | null;
}): string {
  const lines = [
    `Опрос цен в «${input.title ?? 'группе'}» закончился: ответили ${input.answers.length} владельцев техники.`,
  ];
  const byCategory = new Map<string, number[]>();
  for (const answer of input.answers) {
    if (!answer.categorySlug || answer.hourlyRate === null) continue;
    const list = byCategory.get(answer.categorySlug) ?? [];
    list.push(answer.hourlyRate);
    byCategory.set(answer.categorySlug, list);
  }
  if (byCategory.size > 0) {
    lines.push('', 'Цены за час с машинистом:');
    for (const [slug, prices] of byCategory) {
      const range =
        prices.length > 1 ? ` (${rubles(Math.min(...prices))}–${rubles(Math.max(...prices))})` : '';
      lines.push(
        `• ${categoryName(slug)}: медиана ${rubles(median(prices))}${range}, ответов ${prices.length}`,
      );
    }
  }
  if (input.poll) {
    const counts = input.poll.options
      .map((option) => `${option.text} — ${option.voters}`)
      .join(' · ');
    lines.push('', `Анонимный опрос: ${counts} (голосов: ${input.poll.total})`);
  }
  if (input.answers.length > 0) {
    lines.push('', 'Ответы (техника · город · цена · автор):');
    for (const answer of input.answers) {
      const price = [
        answer.hourlyRate !== null ? `${rubles(answer.hourlyRate)}/ч` : null,
        answer.shiftRate !== null ? `смена ${rubles(answer.shiftRate)}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const machine =
        answer.machineName ?? (answer.categorySlug ? categoryName(answer.categorySlug) : 'техника');
      const author = answer.authorName ?? (answer.source === 'telegram' ? 'в личке боту' : '—');
      lines.push(
        `• ${machine} · ${answer.city ?? 'город не указан'} · ${price || 'цена не указана'} · ${author}`,
      );
    }
  }
  lines.push('', 'Все ответы и CSV — /admin → «Опрос цен».');
  let text = lines.join('\n');
  if (text.length > TELEGRAM_MAX) {
    text = `${text.slice(0, TELEGRAM_MAX - 60)}\n…\nПолный список — /admin → «Опрос цен».`;
  }
  return text;
}

async function closeSurvey(state: SurveyState, now: Date): Promise<SurveyRun> {
  const closing: SurveyState = { ...state, status: 'closed', closedAt: now.toISOString() };
  // Claimed by swapping the stored value: of two runs only one closes.
  const claimed = await prisma.appSetting.updateMany({
    where: { key: SURVEY_SETTING, value: JSON.stringify(state) },
    data: { value: JSON.stringify(closing) },
  });
  if (claimed.count !== 1) return 'busy';
  activeCache = null;
  const chat = await prisma.botChat.findUnique({ where: { chatId: state.chatId } });
  // /quiet, removed or muted since: nothing more in the group (the owner still hears).
  const mayWrite = !chat || (!chat.quiet && !chat.removedAt && chat.canWrite);
  if (mayWrite && state.pinned && state.messageId) {
    await telegramRequest('unpinChatMessage', {
      chat_id: state.chatId,
      message_id: state.messageId,
    });
  }
  let poll: SurveyState['poll'] = null;
  if (state.pollMessageId) {
    const stopped = await telegramRequest<{
      options?: { text: string; voter_count: number }[];
      total_voter_count?: number;
    }>('stopPoll', { chat_id: state.chatId, message_id: state.pollMessageId });
    if (stopped.ok && stopped.result?.options) {
      poll = {
        options: stopped.result.options.map((option) => ({
          text: option.text,
          voters: option.voter_count,
        })),
        total: stopped.result.total_voter_count ?? 0,
      };
    }
  }
  const answers = await loadAnswers();
  if (mayWrite && answers.length >= SURVEY_MIN_ANSWERS) {
    await telegramRequest('sendMessage', {
      chat_id: state.chatId,
      text: closingText(answers.length),
      disable_notification: true,
      link_preview_options: { is_disabled: true },
    });
  }
  const closed: SurveyState = { ...closing, answers: answers.length, poll, summarySent: false };
  await prisma.appSetting.update({
    where: { key: SURVEY_SETTING },
    data: { value: JSON.stringify(closed) },
  });
  await sendSummary(closed, answers);
  return 'closed';
}

async function loadAnswers(): Promise<AnswerRow[]> {
  return onePerAuthor(
    (await prisma.priceReport.findMany({
      where: { surveyKey: SURVEY_KEY },
      select: {
        id: true,
        categorySlug: true,
        machineName: true,
        city: true,
        hourlyRate: true,
        shiftRate: true,
        authorName: true,
        source: true,
        reporterHash: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })) as AnswerRow[],
  );
}

/** The results to the owner's private Telegram; marked only when delivered. */
async function sendSummary(state: SurveyState, loaded?: AnswerRow[]) {
  const answers = loaded ?? (await loadAnswers());
  let delivered = false;
  try {
    delivered = await notifyTelegram(
      surveySummary({ title: state.title, answers, poll: state.poll ?? null }),
    );
  } catch (error) {
    console.error('[price-survey] summary not sent', error);
  }
  const tries = (state.summaryTries ?? 0) + 1;
  // Delivered, or given up after a few days (no TELEGRAM_CHAT_ID, the bot
  // blocked): the results stay in /admin «Опрос цен» either way.
  const next = delivered
    ? { ...state, summarySent: true }
    : { ...state, summaryTries: tries, summarySent: tries >= SUMMARY_TRIES };
  await prisma.appSetting.update({
    where: { key: SURVEY_SETTING },
    data: { value: JSON.stringify(next) },
  });
}

/** Daily runs that try to deliver the owner's summary. */
export const SUMMARY_TRIES = 3;

// ---------------------------------------------------------------------------
// Collecting the replies (the webhook)
// ---------------------------------------------------------------------------

let activeCache: { at: number; state: SurveyState | null } | null = null;
const CACHE_MS = 60_000;

/** The open survey within its 7 days, read at most once a minute per instance. */
export async function openSurvey(now: Date = new Date()): Promise<SurveyState | null> {
  if (!activeCache || now.getTime() - activeCache.at > CACHE_MS) {
    activeCache = { at: now.getTime(), state: await loadSurveyState() };
  }
  const state = activeCache.state;
  if (!state || state.status !== 'open' || !state.postedAt || !state.messageId) return null;
  return now.getTime() - new Date(state.postedAt).getTime() < SURVEY_MS ? state : null;
}

/** For tests: forget the cached survey. */
export function resetSurveyCache() {
  activeCache = null;
}

export interface SurveyReplyMessage {
  message_id: number;
  text?: string;
  chat: { id: number };
  from?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  };
  reply_to_message?: { message_id: number };
}

/**
 * A group message: when it replies to the open survey message it becomes the
 * author's answer (one per author — a new reply replaces the old) and is NOT
 * imported as an order; the bot says nothing. 'not_survey' for every other
 * message, which then goes on as usual.
 */
export async function collectSurveyReply(
  message: SurveyReplyMessage,
  now: Date = new Date(),
): Promise<'saved' | 'ignored' | 'not_survey'> {
  if (!message.reply_to_message) return 'not_survey';
  const state = await openSurvey(now);
  if (
    !state ||
    state.chatId !== String(message.chat.id) ||
    state.messageId !== message.reply_to_message.message_id
  ) {
    return 'not_survey';
  }
  const authorId = message.from?.id;
  const text = message.text?.trim();
  if (!authorId || message.from?.is_bot || !text) return 'ignored';
  if (!checkRateLimit(`survey-reply:${authorId}`, { limit: 10, windowMs: 3_600_000 }).ok) {
    return 'ignored';
  }
  const parsed = parseSurveyAnswer(text);
  const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ');
  const username = message.from?.username ? `@${message.from.username}` : '';
  // The Telegram user id is the id of his private chat: the same reporter as
  // his answer to the bot in private.
  const hash = reporterHash('tg', String(authorId));
  await prisma.$transaction([
    prisma.priceReport.deleteMany({
      where: { surveyKey: SURVEY_KEY, reporterHash: hash, source: 'group' },
    }),
    prisma.priceReport.create({
      data: {
        categorySlug: parsed.categorySlug,
        machineName: parsed.machineName,
        city: parsed.city,
        region: parsed.region,
        hourlyRate: parsed.hourly,
        shiftRate: parsed.shift,
        rawText: text.slice(0, 500),
        authorName: [name, username].filter(Boolean).join(' ').slice(0, 100) || null,
        surveyKey: SURVEY_KEY,
        source: 'group',
        reporterHash: hash,
      },
    }),
  ]);
  return 'saved';
}

/** The survey key for a private answer to the bot while the group survey is open. */
export async function currentSurveyKey(now: Date = new Date()): Promise<string | null> {
  return (await openSurvey(now).catch(() => null)) ? SURVEY_KEY : null;
}

/** /admin: the survey's state for the «Опрос цен» card. */
export async function surveyAdminView() {
  const state = await loadSurveyState();
  if (!state) return null;
  const answers = await prisma.priceReport.count({ where: { surveyKey: SURVEY_KEY } });
  return { ...state, answersNow: answers };
}
