import { describe, expect, it, vi } from 'vitest';
import type { InboxMessage, InboxSession } from './mailbox';
import type { OfficeMail, OfficeMailResult } from './smtp';
import {
  MAIL_CURSOR_KEY,
  MAIL_HANDLE_LIMIT,
  MAIL_READ_KEY,
  readReplies,
  type RepliesDb,
  type ReplyRow,
} from './repliesRun';
import { DUPLICATE_CLOSED_AT } from './contacted';

const NOW = new Date('2026-11-12T10:00:00+03:00');

function row(over: Partial<ReplyRow> = {}): ReplyRow {
  return {
    id: 'p1',
    kind: 'site',
    status: 'CONTACTED',
    slug: 'shinomontazh',
    token: 'tok1',
    name: 'Шиномонтаж',
    city: 'Казань',
    email: 'firm@mail.ru',
    emailSentAt: new Date('2026-11-11T12:00:00Z'),
    repliedAt: null,
    replyAnsweredAt: null,
    followUpSentAt: null,
    ...over,
  };
}

function fakeDb(rows: ReplyRow[], cursor: string | null = 'v1:100') {
  const settings = new Map<string, string>(cursor ? [[MAIL_CURSOR_KEY, cursor]] : []);
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const db: RepliesDb = {
    appSetting: {
      findUnique: async ({ where }) =>
        settings.has(where.key) ? { value: settings.get(where.key)! } : null,
      upsert: async ({ where, update }) => {
        settings.set(where.key, update.value);
      },
    },
    prospect: {
      findMany: async ({ where }) =>
        rows.filter((r) => where.email.in.includes((r.email ?? '').toLowerCase())),
      update: async ({ where, data }) => {
        updates.push({ id: where.id, data });
        const target = rows.find((r) => r.id === where.id);
        if (target) Object.assign(target, data);
      },
    },
  };
  return { db, settings, updates };
}

function inbox(messages: (InboxMessage & { body?: string })[], uidNext = 200) {
  const read: number[] = [];
  const session: InboxSession = {
    uidValidity: 'v1',
    uidNext,
    list: async (afterUid, limit) => messages.filter((m) => m.uid > afterUid).slice(0, limit),
    text: async (uid) => {
      read.push(uid);
      return messages.find((m) => m.uid === uid)?.body ?? '';
    },
    close: vi.fn(async () => undefined),
  };
  return { session, read };
}

function message(uid: number, from: string, body: string, over: Partial<InboxMessage> = {}) {
  return {
    uid,
    from,
    subject: 'Re: страница для «Шиномонтаж»',
    messageId: `<m${uid}@mail.ru>`,
    autoSubmitted: false,
    body,
    ...over,
  };
}

function deps(db: RepliesDb, session: InboxSession | null) {
  const send = vi.fn(async (_mail: OfficeMail): Promise<OfficeMailResult> => ({ ok: true }));
  const notify = vi.fn(async (_message: string) => true);
  return {
    send,
    notify,
    deps: {
      db,
      open: async () => session,
      send,
      notify,
      prices: async () => ({ setup: 15000, monthly: 1500 }),
      baseUrl: () => 'https://site.example',
    },
  };
}

describe('readReplies', () => {
  it('ящик не настроен — ничего не делает', async () => {
    const { db } = fakeDb([]);
    const d = deps(db, null);
    expect(await readReplies(NOW, d.deps)).toMatchObject({ skipped: 'no-mailbox' });
  });

  it('первый запуск ставит закладку на конец ящика и старую почту не читает', async () => {
    const { db, settings } = fakeDb([row()], null);
    const { session, read } = inbox([message(150, 'firm@mail.ru', 'Сколько стоит?')]);
    const d = deps(db, session);
    expect(await readReplies(NOW, d.deps)).toMatchObject({ skipped: 'first-run', seen: 0 });
    expect(settings.get(MAIL_CURSOR_KEY)).toBe('v1:199');
    expect(read).toEqual([]);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('посторонние письма ящика не читаются: только отправитель и тема', async () => {
    const { db, settings, updates } = fakeDb([row()]);
    const { session, read } = inbox([
      message(101, 'bank@alfabank.ru', 'Выписка по счёту', { subject: 'Выписка' }),
      message(102, 'partner@firma.ru', 'Акт сверки', { subject: 'Акт сверки' }),
    ]);
    const d = deps(db, session);
    const result = await readReplies(NOW, d.deps);
    expect(result).toMatchObject({ seen: 2, replies: 0 });
    expect(read).toEqual([]);
    expect(updates).toEqual([]);
    expect(d.notify).not.toHaveBeenCalled();
    expect(settings.get(MAIL_CURSOR_KEY)).toBe('v1:102');
  });

  it('вопрос о цене: отметка в карточке, ответ офиса в ту же ветку, сообщение владельцу', async () => {
    const rows = [row()];
    const { db, updates } = fakeDb(rows);
    const { session } = inbox([
      message(101, 'firm@mail.ru', 'Добрый день! Сколько стоит?\n> стоп'),
    ]);
    const d = deps(db, session);
    const result = await readReplies(NOW, d.deps);
    expect(result).toMatchObject({ replies: 1, answered: 1, stops: 0, needOwner: 0 });
    expect(updates[0]).toMatchObject({
      id: 'p1',
      data: { repliedAt: NOW, replyText: 'Добрый день! Сколько стоит?' },
    });
    expect(rows[0]!.status).toBe('CONTACTED');
    expect(rows[0]!.replyAnsweredAt).toEqual(NOW);
    const mail = d.send.mock.calls[0]![0];
    expect(mail.to).toBe('firm@mail.ru');
    expect(mail.text).toContain('15 000 ₽');
    expect(mail.text).toContain('https://site.example/preview/tok1');
    expect(mail.headers).toEqual({ 'In-Reply-To': '<m101@mail.ru>', References: '<m101@mail.ru>' });
    expect(d.notify.mock.calls[0]![0]).toContain('Офис ответил сам');
  });

  it('«стоп» снимает фирму с рассылки, офис ей не отвечает', async () => {
    const rows = [row()];
    const { db } = fakeDb(rows);
    const { session } = inbox([message(101, 'Firm@Mail.ru'.toLowerCase(), 'Стоп')]);
    const d = deps(db, session);
    const result = await readReplies(NOW, d.deps);
    expect(result).toMatchObject({ replies: 1, stops: 1, answered: 0 });
    expect(rows[0]).toMatchObject({ status: 'DECLINED', optOutAt: NOW, declinedAt: NOW });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.notify.mock.calls[0]![0]).toContain('сняли с рассылки');
  });

  it('согласие: офис подтверждает и зовёт владельца; статус сам не меняет', async () => {
    const rows = [row()];
    const { db } = fakeDb(rows);
    const { session } = inbox([message(101, 'firm@mail.ru', 'Согласны, выставляйте счёт')]);
    const d = deps(db, session);
    const result = await readReplies(NOW, d.deps);
    expect(result).toMatchObject({ replies: 1, answered: 1, needOwner: 1 });
    expect(rows[0]!.status).toBe('CONTACTED');
    expect(d.notify.mock.calls[0]![0]).toContain('СОГЛАСИЕ');
  });

  it('второе письмо той же фирмы: отметка и сообщение есть, второго автоответа нет', async () => {
    const rows = [row({ replyAnsweredAt: new Date('2026-11-11T15:00:00Z') })];
    const { db } = fakeDb(rows);
    const { session } = inbox([message(101, 'firm@mail.ru', 'А сколько стоит домен?')]);
    const d = deps(db, session);
    const result = await readReplies(NOW, d.deps);
    expect(result).toMatchObject({ replies: 1, answered: 0, needOwner: 1 });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.notify.mock.calls[0]![0]).toContain('ответьте сами');
  });

  it('клиенту (после «Согласился») офис сам не отвечает', async () => {
    const rows = [row({ status: 'AGREED' })];
    const { db } = fakeDb(rows);
    const { session } = inbox([message(101, 'firm@mail.ru', 'Сколько стоит продление?')]);
    const d = deps(db, session);
    await readReplies(NOW, d.deps);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it('автоответ не считается ответом фирмы', async () => {
    const rows = [row()];
    const { db, updates } = fakeDb(rows);
    const { session } = inbox([
      message(101, 'firm@mail.ru', 'Я в отпуске до 20-го', { autoSubmitted: true }),
    ]);
    const d = deps(db, session);
    expect(await readReplies(NOW, d.deps)).toMatchObject({ replies: 0 });
    expect(updates).toEqual([]);
  });

  it('отчёт о недоставке помечает адрес и закрывает напоминание', async () => {
    const rows = [row({ email: 'dead@firma.ru' })];
    const { db } = fakeDb(rows);
    const { session } = inbox([
      message(101, 'mailer-daemon@yandex.ru', '<dead@firma.ru>: 550 5.1.1 user unknown', {
        subject: 'Недоставленное сообщение',
      }),
    ]);
    const d = deps(db, session);
    expect(await readReplies(NOW, d.deps)).toMatchObject({ bounces: 1, replies: 0 });
    expect(rows[0]).toMatchObject({
      emailBouncedAt: NOW,
      followUpSentAt: DUPLICATE_CLOSED_AT,
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('за проход разбирается ограниченное число ответов, остальные ждут за закладкой', async () => {
    const rows = [row()];
    const { db, settings } = fakeDb(rows);
    const many = Array.from({ length: MAIL_HANDLE_LIMIT + 3 }, (_, i) =>
      message(101 + i, 'firm@mail.ru', 'Передал директору'),
    );
    const { session, read } = inbox(many);
    const d = deps(db, session);
    await readReplies(NOW, d.deps);
    expect(read).toHaveLength(MAIL_HANDLE_LIMIT);
    expect(settings.get(MAIL_CURSOR_KEY)).toBe(`v1:${100 + MAIL_HANDLE_LIMIT}`);
  });

  it('ящик не открылся: ошибка без адресов, итог записан, исключения нет', async () => {
    const { db, settings } = fakeDb([row()]);
    const d = deps(db, null);
    const result = await readReplies(NOW, {
      ...d.deps,
      open: async () => {
        throw new Error('Invalid credentials for owner@ya.ru');
      },
    });
    expect(result.error).toBe('Invalid credentials for <адрес>');
    expect(JSON.parse(settings.get(MAIL_READ_KEY)!)).toMatchObject({ error: result.error });
  });
});
