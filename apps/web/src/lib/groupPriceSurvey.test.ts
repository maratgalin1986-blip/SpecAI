import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory AppSetting, BotChat and PriceReport, and Telegram's answers.
const settings = new Map<string, string>();
interface Chat {
  chatId: string;
  title: string | null;
  quiet: boolean;
  silent: boolean;
  canWrite: boolean;
  removedAt: Date | null;
}
let chats: Chat[] = [];
type Report = Record<string, unknown> & { id: string; createdAt: Date };
let reports: Report[] = [];

const unique = () => Object.assign(new Error('unique'), { code: 'P2002' });
const prisma = {
  appSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      settings.has(where.key) ? { key: where.key, value: settings.get(where.key)! } : null,
    ),
    create: vi.fn(async ({ data }: { data: { key: string; value: string } }) => {
      if (settings.has(data.key)) throw unique();
      settings.set(data.key, data.value);
      return data;
    }),
    update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: string } }) => {
      settings.set(where.key, data.value);
      return { key: where.key, value: data.value };
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { key: string; value: string };
        data: { value: string };
      }) => {
        if (settings.get(where.key) !== where.value) return { count: 0 };
        settings.set(where.key, data.value);
        return { count: 1 };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
      settings.delete(where.key);
      return { count: 1 };
    }),
  },
  botChat: {
    findUnique: vi.fn(
      async ({ where }: { where: { chatId: string } }) =>
        chats.find((chat) => chat.chatId === where.chatId) ?? null,
    ),
    findMany: vi.fn(async ({ take }: { take: number }) =>
      chats
        .filter((chat) => !chat.removedAt && chat.canWrite && !chat.quiet)
        .slice(0, take)
        .map(({ chatId, title }) => ({ chatId, title })),
    ),
  },
  priceReport: {
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = reports.length;
      reports = reports.filter(
        (row) =>
          !(
            row.surveyKey === where.surveyKey &&
            row.reporterHash === where.reporterHash &&
            row.source === where.source
          ),
      );
      return { count: before - reports.length };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, id: `r${reports.length + 1}-${Math.random()}`, createdAt: new Date() };
      reports.unshift(row);
      return row;
    }),
    findMany: vi.fn(async () => reports),
    count: vi.fn(async () => reports.length),
  },
  $transaction: vi.fn(async (operations: Promise<unknown>[]) => {
    const results = [];
    for (const operation of operations) results.push(await operation);
    return results;
  }),
};
const loadPickedChannelChatId = vi.fn();
const notifyTelegram = vi.fn();
vi.mock('@specai/database', () => ({ prisma, HOUSE_COMPANY_ID: 'specplast16-house' }));
vi.mock('./channelTarget', () => ({ loadPickedChannelChatId }));
vi.mock('./notify', () => ({ notifyTelegram }));

type Call = { method: string; body: Record<string, unknown> };
const calls: Call[] = [];
let answer: (call: Call) => unknown;
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init: { body: string }) => {
    const call = { method: url.split('/').pop()!, body: JSON.parse(init.body) };
    calls.push(call);
    const result = answer(call);
    if (result === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError');
    if (result === 'offline') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(result));
  }),
);
process.env.TELEGRAM_BOT_TOKEN = 'token';
process.env.NEXTAUTH_SECRET = 'test-secret';

const survey = await import('./groupPriceSurvey');
const {
  AMBIGUOUS_TEXT,
  POLL_OPTIONS,
  SURVEY_SETTING,
  collectSurveyReply,
  resetSurveyCache,
  runGroupPriceSurvey,
  surveyMessageText,
} = survey;

const OWNER_GROUP = '-100500';
const chat = (chatId: string, extra: Partial<Chat> = {}): Chat => ({
  chatId,
  title: `Чат ${chatId}`,
  quiet: false,
  silent: true,
  canWrite: true,
  removedAt: null,
  ...extra,
});
const start = new Date('2026-10-19T16:00:00Z');
const later = (days: number) => new Date(start.getTime() + days * 86_400_000);
const sentTo = (method: string) => calls.filter((call) => call.method === method);

function telegramOk(call: Call) {
  if (call.method === 'sendMessage') return { ok: true, result: { message_id: 77 } };
  if (call.method === 'sendPoll') return { ok: true, result: { message_id: 78 } };
  if (call.method === 'stopPoll') {
    return {
      ok: true,
      result: {
        options: POLL_OPTIONS.map((text, i) => ({ text, voter_count: i === 3 ? 5 : 1 })),
        total_voter_count: 11,
      },
    };
  }
  return { ok: true, result: true };
}

let replyId = 1000;
const reply = (authorId: number, text: string, to = 77, chatId = OWNER_GROUP) => ({
  message_id: (replyId += 1),
  text,
  chat: { id: Number(chatId) },
  from: { id: authorId, first_name: `Автор${authorId}`, username: `user${authorId}` },
  reply_to_message: { message_id: to },
});

beforeEach(() => {
  settings.clear();
  chats = [chat(OWNER_GROUP, { title: 'Услуги спецтехники РТ' }), chat('-100600')];
  reports = [];
  calls.length = 0;
  answer = telegramOk;
  loadPickedChannelChatId.mockReset().mockResolvedValue(OWNER_GROUP);
  notifyTelegram.mockReset().mockResolvedValue(true);
  resetSurveyCache();
});

describe('where the survey goes', () => {
  it('to the chat picked for the daily post, even in the silent mode', async () => {
    expect(await runGroupPriceSurvey(start)).toBe('posted');
    expect(sentTo('sendMessage')).toHaveLength(1);
    expect(sentTo('sendMessage')[0]!.body.chat_id).toBe(OWNER_GROUP);
    expect(calls.every((call) => call.body.chat_id === OWNER_GROUP)).toBe(true);
  });

  it('without a pick: the only active chat, never one of several', async () => {
    loadPickedChannelChatId.mockResolvedValue(null);
    chats = [chat('-1001', { title: 'Единственный' }), chat('-1002', { removedAt: new Date() })];
    expect(await runGroupPriceSurvey(start)).toBe('posted');
    expect(sentTo('sendMessage')[0]!.body.chat_id).toBe('-1001');
  });

  it('several chats and no pick: nothing sent, the owner is told once', async () => {
    loadPickedChannelChatId.mockResolvedValue(null);
    expect(await runGroupPriceSurvey(start)).toBe('no_chat');
    expect(await runGroupPriceSurvey(later(1))).toBe('no_chat');
    expect(calls).toHaveLength(0);
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
    expect(notifyTelegram).toHaveBeenCalledWith(AMBIGUOUS_TEXT);
  });

  it('a chat that said /quiet gets nothing', async () => {
    chats[0]!.quiet = true;
    expect(await runGroupPriceSurvey(start)).toBe('no_chat');
    expect(calls).toHaveLength(0);
  });
});

describe('the week of the survey', () => {
  it('posts the message (pinned) and the anonymous poll once', async () => {
    await runGroupPriceSurvey(start);
    expect(await runGroupPriceSurvey(later(1))).toBe('open');
    expect(await runGroupPriceSurvey(later(2))).toBe('open');
    expect(sentTo('sendMessage')).toHaveLength(1);
    expect(sentTo('sendMessage')[0]!.body.text).toBe(surveyMessageText());
    expect(surveyMessageText('bot')).toContain('t.me/bot?start=ceny');
    expect(surveyMessageText('bot')).toContain('Проголосовать анонимно — в опросе ниже');
    expect(sentTo('pinChatMessage')[0]!.body).toMatchObject({
      message_id: 77,
      disable_notification: true,
    });
    const [poll] = sentTo('sendPoll');
    expect(sentTo('sendPoll')).toHaveLength(1);
    expect(poll!.body).toMatchObject({
      question: 'Сколько вы берёте за час работы техники с машинистом?',
      is_anonymous: true,
      allows_multiple_answers: false,
    });
    expect((poll!.body.options as { text: string }[]).map((option) => option.text)).toEqual([
      ...POLL_OPTIONS,
    ]);
    expect(JSON.parse(settings.get(SURVEY_SETTING)!)).toMatchObject({
      status: 'open',
      messageId: 77,
      pollMessageId: 78,
      pinned: true,
    });
  });

  it('a picked chat the bot left gets nothing, and never another chat instead', async () => {
    chats[0]!.removedAt = new Date();
    // Even with exactly one other active chat (it may be a stranger's group).
    expect(await runGroupPriceSurvey(start)).toBe('no_chat');
    expect(calls).toHaveLength(0);
    expect(notifyTelegram).toHaveBeenCalledWith(AMBIGUOUS_TEXT);
  });

  it('a network error before Telegram: nothing posted, the next run tries again', async () => {
    answer = () => 'offline';
    expect(await runGroupPriceSurvey(start)).toBe('failed');
    expect(settings.has(SURVEY_SETTING)).toBe(false);
    answer = telegramOk;
    expect(await runGroupPriceSurvey(later(1))).toBe('posted');
  });

  it('no answer from Telegram in time (it may have posted): never a second survey', async () => {
    answer = () => 'timeout';
    expect(await runGroupPriceSurvey(start)).toBe('failed');
    answer = telegramOk;
    expect(await runGroupPriceSurvey(later(1))).toBe('done');
    expect(sentTo('sendMessage')).toHaveLength(1);
    expect(notifyTelegram).toHaveBeenCalledWith(expect.stringContaining('проверьте группу'));
  });

  it('a failed send keeps nothing and the next run tries again', async () => {
    answer = () => ({ ok: false, error_code: 403, description: 'Forbidden' });
    expect(await runGroupPriceSurvey(start)).toBe('failed');
    expect(settings.has(SURVEY_SETTING)).toBe(false);
    answer = telegramOk;
    expect(await runGroupPriceSurvey(later(1))).toBe('posted');
  });

  it('collects only replies to the survey message in its chat, one per author, never as orders', async () => {
    await runGroupPriceSurvey(start);
    const now = later(1);
    expect(await collectSurveyReply(reply(1, 'JCB 3CX, Казань, 3000/ч'), now)).toBe('saved');
    // A new reply of the same author replaces his answer.
    expect(await collectSurveyReply(reply(1, 'JCB 3CX, Казань, 3200/ч'), now)).toBe('saved');
    expect(await collectSurveyReply(reply(2, 'Самосвал Шакман, Елабуга, 25 тыс/смена'), now)).toBe(
      'saved',
    );
    // Not a reply to the survey, another chat, no reply at all: not the survey's.
    expect(await collectSurveyReply(reply(3, 'нужен кран', 12), now)).toBe('not_survey');
    expect(await collectSurveyReply(reply(4, 'КМУ 3500', 77, '-100600'), now)).toBe('not_survey');
    expect(
      await collectSurveyReply({ message_id: 5, text: 'КМУ', chat: { id: -100500 } }, now),
    ).toBe('not_survey');
    expect(reports).toHaveLength(2);
    expect(reports.find((row) => row.hourlyRate === 3200)).toMatchObject({
      source: 'group',
      categorySlug: 'backhoe-loaders',
      machineName: 'JCB 3CX',
      city: 'Казань',
      authorName: 'Автор1 @user1',
    });
    // No phone from a group reply.
    expect(reports.every((row) => !('phone' in row))).toBe(true);
    expect(reports.find((row) => row.shiftRate === 25000)).toMatchObject({ hourlyRate: null });
    // The bot answered nothing in the group.
    expect(sentTo('sendMessage')).toHaveLength(1);
  });

  it('after 7 days replies are no longer counted', async () => {
    await runGroupPriceSurvey(start);
    resetSurveyCache();
    expect(await collectSurveyReply(reply(1, 'JCB, Казань, 3000'), later(8))).toBe('not_survey');
    expect(reports).toHaveLength(0);
  });
});

describe('the end of the survey', () => {
  async function weekWithAnswers(count: number) {
    await runGroupPriceSurvey(start);
    for (let i = 1; i <= count; i += 1) {
      await collectSurveyReply(reply(i, `JCB 3CX, Казань, ${2500 + i * 250}/ч`), later(1));
    }
    calls.length = 0;
  }

  it('unpins, stops the poll, thanks the group with ≥ 3 answers and tells the owner everything', async () => {
    await weekWithAnswers(3);
    expect(await runGroupPriceSurvey(later(6))).toBe('open');
    expect(await runGroupPriceSurvey(later(7))).toBe('closed');
    expect(sentTo('unpinChatMessage')[0]!.body).toMatchObject({ message_id: 77 });
    expect(sentTo('stopPoll')[0]!.body).toMatchObject({ message_id: 78 });
    const closing = sentTo('sendMessage');
    expect(closing).toHaveLength(1);
    expect(closing[0]!.body.text).toContain('Ответили 3 владельцев техники');
    expect(closing[0]!.body.text).toContain('/ceny');
    const summary = notifyTelegram.mock.calls.at(-1)![0] as string;
    expect(summary).toContain('ответили 3 владельцев техники');
    expect(summary).toContain('Экскаваторы-погрузчики: медиана 3 000 ₽');
    expect(summary).toContain('JCB 3CX · Казань · 2 750 ₽/ч · Автор1 @user1');
    expect(summary).toContain('Анонимный опрос: до 2 000 ₽ — 1');
    expect(summary).toContain('3 000–3 500 ₽ — 5');
    expect(summary).toContain('(голосов: 11)');
    expect(JSON.parse(settings.get(SURVEY_SETTING)!)).toMatchObject({
      status: 'closed',
      answers: 3,
      poll: { total: 11 },
    });
    // Closed for good: a later run posts nothing.
    calls.length = 0;
    expect(await runGroupPriceSurvey(later(9))).toBe('done');
    expect(calls).toHaveLength(0);
  });

  it('the summary that did not reach the owner is sent again by the next run', async () => {
    await weekWithAnswers(3);
    notifyTelegram.mockResolvedValueOnce(false);
    expect(await runGroupPriceSurvey(later(7))).toBe('closed');
    expect(JSON.parse(settings.get(SURVEY_SETTING)!).summarySent).toBe(false);
    calls.length = 0;
    expect(await runGroupPriceSurvey(later(8))).toBe('closed');
    // Nothing more in the group, the owner gets it now.
    expect(calls).toHaveLength(0);
    expect(notifyTelegram).toHaveBeenLastCalledWith(expect.stringContaining('ответили 3'));
    expect(JSON.parse(settings.get(SURVEY_SETTING)!).summarySent).toBe(true);
    expect(await runGroupPriceSurvey(later(9))).toBe('done');
  });

  it('stops trying after three undelivered summaries (no owner chat set)', async () => {
    await weekWithAnswers(1);
    notifyTelegram.mockResolvedValue(false);
    expect(await runGroupPriceSurvey(later(7))).toBe('closed');
    expect(await runGroupPriceSurvey(later(8))).toBe('closed');
    expect(await runGroupPriceSurvey(later(9))).toBe('closed');
    expect(await runGroupPriceSurvey(later(10))).toBe('done');
    expect(notifyTelegram).toHaveBeenCalledTimes(3);
  });

  it('fewer than 3 answers: no closing line in the group, the owner still hears', async () => {
    await weekWithAnswers(2);
    expect(await runGroupPriceSurvey(later(7))).toBe('closed');
    expect(sentTo('sendMessage')).toHaveLength(0);
    expect(notifyTelegram).toHaveBeenLastCalledWith(expect.stringContaining('ответили 2'));
  });

  it('a chat that said /quiet meanwhile gets no closing line', async () => {
    await weekWithAnswers(4);
    chats[0]!.quiet = true;
    expect(await runGroupPriceSurvey(later(7))).toBe('closed');
    expect(sentTo('sendMessage')).toHaveLength(0);
    expect(sentTo('unpinChatMessage')).toHaveLength(0);
    expect(notifyTelegram).toHaveBeenLastCalledWith(expect.stringContaining('ответили 4'));
  });
});
