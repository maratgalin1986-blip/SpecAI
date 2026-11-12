import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mskDayBounds } from '@/lib/adminCrm';
import type { OfficeMail as SendEmailInput } from './smtp';

// Written by T6 in parallel; the runner takes the settings through deps in every test.
vi.mock('@/lib/office/settings', () => ({
  readOfficeSettings: async () => ({
    outreachPaused: false,
    dailyCap: 20,
    replyTo: '',
    whatsappToPhone: false,
  }),
}));
// Never touch a real database from the tests: prisma is only the default for `db`.
vi.mock('@specai/database', () => ({ prisma: {} }));
// К1: the office never sends through Resend — the spy proves it.
const resendSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/email', () => ({ sendEmail: resendSpy, isEmailConfigured: () => true }));

import { LEGAL_SIGNATURE, NOT_OFFER_LINE, STOP_LINE, WHATSAPP_MAX_LENGTH } from './outreach';
import type { SentOffer } from './aiOffer';
import type { Dossier } from './dossier';
import { buildOffer } from './offer';
import {
  approvalKey,
  FOLLOW_UP_AFTER_DAYS,
  FOLLOW_UP_MAX_DAYS,
  followUpWindow,
  markReplied,
  OUTREACH_BUDGET_MS,
  RAMP_START,
  rampedCap,
  outreachErrorText,
  AUTO_SEND_HOURS,
  DELIVERY_UNKNOWN,
  MAIL_FAILURES_STOP,
  inAutoSendHours,
  SEND_TIMEOUT_MS,
  planOutreach,
  sendOutreach,
  type OutreachDb,
  type OutreachRow,
  type OutreachResult,
  type OutreachRunSettings,
} from './outreachRun';
import { DUPLICATE_CLOSED_AT, isDuplicateMark } from './contacted';

const NOW = new Date('2026-11-09T08:00:00+03:00');
/** Тот же день, 11:00 по Москве: в дневном окне лимита уже есть «раньше сегодня». */
const LATER = new Date('2026-11-09T11:00:00+03:00');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function row(over: Partial<OutreachRow> & { id: string }): OutreachRow {
  return {
    kind: 'site',
    status: 'READY',
    slug: `slug-${over.id}`,
    token: `tok-${over.id}`,
    name: `Компания ${over.id}`,
    phone: '+78432001122',
    email: `${over.id}@example.com`,
    whatsapp: null,
    address: null,
    city: 'Казань',
    lat: null,
    lon: null,
    niche: 'dentist',
    tags: null,
    hours: null,
    emailSentAt: null,
    whatsappSentAt: null,
    contactedAt: null,
    followUpSentAt: null,
    repliedAt: null,
    dossierJson: null,
    offerJson: null,
    ...over,
  };
}

/** A prospect written to `days` ago who has not answered: due for the reminder. */
function contacted(id: string, days: number, over: Partial<OutreachRow> = {}): OutreachRow {
  const at = daysAgo(days);
  return row({ id, status: 'CONTACTED', emailSentAt: at, contactedAt: at, ...over });
}

type Update = { id: string; data: Record<string, unknown> };
type Row = OutreachRow & {
  outreachError?: string | null;
  outreachErrorAt?: Date | null;
  offerAngle?: string | null;
  previewViews?: number;
  agreedAt?: Date | null;
};

/**
 * A fake Prospect table: counts by the day, lists by the filters the runner uses, records
 * updates. Every write in a test happens «today», so the «not failed today» filter is
 * «outreachErrorAt empty or before the start of the Moscow day».
 */
function fakeDb(rows: Row[]) {
  const updates: Update[] = [];
  const claims: Update[] = [];
  // One OR condition, with SQL null semantics: every field matches (null, { not: null },
  // { lt: Date }, startsWith, endsWith); a comparison with a NULL column is never true.
  const matches = (r: Row, condition: object) =>
    Object.entries(condition).every(([key, cond]) => {
      const value = (r as unknown as Record<string, unknown>)[key];
      if (cond === null) return value === null || value === undefined;
      const c = cond as { not?: null; lt?: Date; startsWith?: string; endsWith?: string };
      if ('not' in c) return value !== null && value !== undefined;
      if (c.lt !== undefined) return value instanceof Date && value.getTime() < c.lt.getTime();
      if (typeof value !== 'string') return false;
      if (c.startsWith !== undefined) return value.startsWith(c.startsWith);
      if (c.endsWith !== undefined) return value.endsWith(c.endsWith);
      return false;
    });
  /** Everything the owner could approve on /admin/office/pisma for these rows (К2). */
  const approveAll = () =>
    rows.flatMap((r) => [
      approvalKey(r.id, 'email', 'first'),
      approvalKey(r.id, 'whatsapp', 'first'),
      approvalKey(r.id, 'email', 'followUp'),
    ]);
  const inRange = (at: Date | null, range: { gte: Date; lt: Date }) =>
    !!at && at.getTime() >= range.gte.getTime() && at.getTime() < range.lt.getTime();
  const db: OutreachDb = {
    prospect: {
      async groupBy({ where }) {
        const w = where as {
          kind: string;
          previewViews?: unknown;
          repliedAt?: unknown;
          agreedAt?: unknown;
        };
        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.kind !== w.kind || !r.offerAngle || !r.contactedAt) continue;
          if (w.previewViews && !(r.previewViews ?? 0)) continue;
          if (w.repliedAt && !r.repliedAt) continue;
          if (w.agreedAt && !r.agreedAt) continue;
          counts.set(r.offerAngle, (counts.get(r.offerAngle) ?? 0) + 1);
        }
        return [...counts].map(([offerAngle, n]) => ({ offerAngle, _count: { _all: n } }));
      },
      async count({ where }) {
        if (where.offerJson) {
          return rows.filter(
            (r) =>
              inRange(r.contactedAt, where.contactedAt!) &&
              !!r.offerJson?.includes(where.offerJson!.contains),
          ).length;
        }
        return rows.filter((r) =>
          where.emailSentAt
            ? inRange(r.emailSentAt, where.emailSentAt)
            : where.whatsappSentAt
              ? inRange(r.whatsappSentAt, where.whatsappSentAt)
              : where.followUpSentAt
                ? inRange(r.followUpSentAt, where.followUpSentAt)
                : true,
        ).length;
      },
      async findMany({ where, orderBy, take }) {
        const sent = where.emailSentAt;
        const found = rows
          .filter((r) => where.status.in.includes(r.status))
          .filter((r) => (where.OR ? where.OR.some((c) => matches(r, c)) : true))
          .filter((r) => (where.AND ?? []).every((part) => part.OR.some((c) => matches(r, c))))
          .filter(
            (r) =>
              !sent ||
              (!!r.emailSentAt &&
                r.emailSentAt.getTime() >= sent.gte.getTime() &&
                r.emailSentAt.getTime() <= sent.lte.getTime()),
          )
          .filter((r) => !where.email || r.email !== null)
          .filter((r) => where.followUpSentAt !== null || r.followUpSentAt === null)
          .filter((r) => where.repliedAt !== null || r.repliedAt === null);
        if (!Array.isArray(orderBy) && 'emailSentAt' in orderBy) {
          found.sort((a, b) => a.emailSentAt!.getTime() - b.emailSentAt!.getTime());
        }
        return found.slice(0, take);
      },
      async update({ where, data }) {
        updates.push({ id: where.id, data });
        const target = rows.find((r) => r.id === where.id);
        if (target) Object.assign(target, data);
        return target;
      },
      async updateMany({ where, data }) {
        // A claim («…SentAt: null» in where) takes the row only while that mark is still empty.
        const free = (r: Row) =>
          (where.emailSentAt !== null || !r.emailSentAt) &&
          (where.whatsappSentAt !== null || !r.whatsappSentAt) &&
          (where.followUpSentAt !== null || !r.followUpSentAt);
        const target = rows.find(
          (r) => r.id === where.id && where.status.in.includes(r.status) && free(r),
        );
        if (!target) return { count: 0 };
        // Claims are kept apart, so that `updates` stays «what the pass recorded about the row».
        const claim =
          where.emailSentAt === null ||
          where.whatsappSentAt === null ||
          where.followUpSentAt === null;
        (claim ? claims : updates).push({ id: where.id, data });
        Object.assign(target, data);
        return { count: 1 };
      },
    },
  };
  return { db, updates, claims, approveAll };
}

function settings(over: Partial<OutreachRunSettings> = {}): () => Promise<OutreachRunSettings> {
  return async () => ({
    outreachPaused: false,
    dailyCap: 20,
    replyTo: 'office@example.com',
    whatsappToPhone: false,
    outreachMode: 'auto',
    // Тесты шлюза WhatsApp ниже описывают режим с явно включённым whatsappAuto.
    whatsappAuto: true,
    ...over,
  });
}

const okEmail = vi.fn(async (_input: SendEmailInput) => ({ ok: true as const }));
const okWhatsApp = vi.fn(async (_digits: string, _text: string) => ({ ok: true as const }));
const noSleep = vi.fn(async (_ms: number) => {});
const prices = async () => ({ setup: 15000, monthly: 1500 });

function deps(db: OutreachDb, over: Record<string, unknown> = {}) {
  return {
    db,
    settings: settings(),
    email: okEmail,
    whatsapp: okWhatsApp,
    channels: () => ({ email: true, whatsapp: true }),
    prices,
    sleep: noSleep,
    baseUrl: () => 'https://example.test',
    unsubscribe: (base: string, token: string) => ({
      page: `${base}/otpiska/${token}?s=sig`,
      oneClick: `${base}/api/office/unsubscribe?t=${token}&s=sig`,
    }),
    optedOut: async () => ({ emails: new Set<string>(), phones: new Set<string>() }),
    contacted: async () => ({ emails: new Map<string, Date>(), phones: new Map<string, Date>() }),
    verifyMail: async () => ({ ok: true as const }),
    lock: async () => async () => {},
    ...over,
  };
}

beforeEach(() => {
  okEmail.mockClear();
  okWhatsApp.mockClear();
  noSleep.mockClear();
});

describe('sendOutreach', () => {
  it('is skipped while the owner keeps the outreach paused', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(
      NOW,
      deps(db, { settings: settings({ outreachPaused: true }) }),
    );
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: 'paused', errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('sends one letter per READY prospect with an address and marks it CONTACTED', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' }), row({ id: 'b', email: null })]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toEqual({
      email: 1,
      whatsapp: 0,
      followUps: 0,
      skipped: null,
      errors: 0,
      // Первые письма прохода — для сообщения владельцу (тик снимает поле перед ответом).
      samples: [{ name: 'Компания a', city: 'Казань', kind: 'site', token: 'tok-a' }],
    });
    expect(okEmail).toHaveBeenCalledTimes(1);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.to).toBe('a@example.com');
    expect(sent.replyTo).toBe('office@example.com');
    // К3: «Больше не писать» in the letter and the one-click header for mail clients.
    expect(sent.headers).toEqual({
      'List-Unsubscribe': '<https://example.test/api/office/unsubscribe?t=tok-a&s=sig>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(sent.text).toContain('Больше не писать: https://example.test/otpiska/tok-a?s=sig');
    expect(sent.html).toContain('https://example.test/otpiska/tok-a?s=sig');
    expect(sent.text).toContain('https://example.test/preview/tok-a');
    // «Кто мы и цены» leads to the service page, labelled with the channel and the slug (S12).
    expect(sent.text).toContain(
      'Кто мы и цены: https://example.test/sajt-pod-klyuch?utm_source=email&utm_campaign=slug-a',
    );
    // No dossier: the personal offer with a general angle (U2) — a fact about the card,
    // no prices, not an offer, a draft, the legal signature.
    expect(sent.text).toContain('В открытой карточке компании Компания a на карте не указан сайт.');
    expect(sent.text).toContain('Что на странице:');
    expect(sent.text).toContain(
      'После подключения клиент сможет оставить заявку на странице — она придёт вам на почту.',
    );
    expect(sent.text).not.toContain('₽');
    expect(sent.text).toContain(NOT_OFFER_LINE);
    expect(sent.text).toContain('Это черновик, а не официальный сайт');
    expect(sent.text).toContain(`— ${LEGAL_SIGNATURE}`);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.id).toBe('a');
    expect(updates[0]!.data).toMatchObject({ status: 'CONTACTED', outreachError: null });
    expect(updates[0]!.data.emailSentAt).toBeInstanceOf(Date);
    expect(updates[0]!.data.contactedAt).toBeInstanceOf(Date);
  });

  it('never writes twice to the same channel; a CONTACTED prospect gets the other one', async () => {
    const old = new Date('2026-11-08T10:00:00+03:00');
    const { db, updates } = fakeDb([
      row({
        id: 'a',
        status: 'CONTACTED',
        emailSentAt: old,
        contactedAt: old,
        whatsapp: '+79271112233',
      }),
      row({ id: 'b', status: 'CONTACTED', emailSentAt: old, contactedAt: old }),
    ]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toEqual({ email: 0, whatsapp: 1, followUps: 0, skipped: null, errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(okWhatsApp).toHaveBeenCalledWith(
      '79271112233',
      expect.stringContaining('/preview/tok-a'),
    );
    expect(okWhatsApp.mock.calls[0]![1]).toContain(
      'https://example.test/sajt-pod-klyuch?utm_source=whatsapp&utm_campaign=slug-a',
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data).toMatchObject({ status: 'CONTACTED' });
    // contactedAt was already set: it is not overwritten.
    expect(updates[0]!.data.contactedAt).toBeUndefined();
    expect(updates[0]!.data.whatsappSentAt).toBeInstanceOf(Date);
  });

  it('WhatsApp to a plain mobile only with the owner setting, with a pause between messages', async () => {
    const rows = [
      row({ id: 'a', email: null, phone: '+79270000001' }),
      row({ id: 'b', email: null, phone: '+79270000002' }),
      row({ id: 'c', email: null, phone: '+78432001122' }),
    ];
    const first = fakeDb(rows.map((r) => ({ ...r })));
    expect(await sendOutreach(NOW, deps(first.db))).toEqual({
      email: 0,
      whatsapp: 0,
      followUps: 0,
      skipped: null,
      errors: 0,
    });
    const second = fakeDb(rows.map((r) => ({ ...r })));
    const result = await sendOutreach(
      NOW,
      deps(second.db, { settings: settings({ whatsappToPhone: true }) }),
    );
    expect(result.whatsapp).toBe(2);
    expect(okWhatsApp.mock.calls.map((c) => c[0])).toEqual(['79270000001', '79270000002']);
    expect(noSleep).toHaveBeenCalledTimes(1);
    const pause = noSleep.mock.calls[0]![0];
    expect(pause).toBeGreaterThanOrEqual(1000);
    expect(pause).toBeLessThanOrEqual(2000);
    for (const text of okWhatsApp.mock.calls.map((c) => c[1])) {
      expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
      expect(text).toContain('«стоп»');
    }
  });

  it('respects the daily cap per channel, counting what went out this Moscow day', async () => {
    const { start } = mskDayBounds(NOW);
    // Дневное окно лимита — с 8:00 по Москве: считаются письма, ушедшие в нём.
    const earlierToday = new Date(start.getTime() + 9 * 3_600_000);
    const yesterday = new Date(start.getTime() - 3_600_000);
    const { db } = fakeDb([
      row({
        id: 'sent1',
        status: 'CONTACTED',
        emailSentAt: earlierToday,
        contactedAt: earlierToday,
      }),
      row({
        id: 'sent2',
        status: 'CONTACTED',
        emailSentAt: earlierToday,
        contactedAt: earlierToday,
      }),
      row({ id: 'old', status: 'CONTACTED', emailSentAt: yesterday, contactedAt: yesterday }),
      row({ id: 'a' }),
      row({ id: 'b' }),
      row({ id: 'c', whatsapp: '+79271112233' }),
    ]);
    const result = await sendOutreach(LATER, deps(db, { settings: settings({ dailyCap: 3 }) }));
    // 2 letters already today → 1 left; WhatsApp: none today → up to 3.
    expect(result.email).toBe(1);
    expect(result.whatsapp).toBe(1);
    expect(okEmail.mock.calls[0]![0].to).toBe('a@example.com');
  });

  it('does nothing when no channel is configured on the server', async () => {
    const { db, updates } = fakeDb([row({ id: 'a', whatsapp: '+79271112233' })]);
    const result = await sendOutreach(
      NOW,
      deps(db, { channels: () => ({ email: false, whatsapp: false }) }),
    );
    expect(result).toEqual({
      email: 0,
      whatsapp: 0,
      followUps: 0,
      skipped: null,
      errors: 0,
      mail: 'no-smtp',
    });
    expect(updates).toEqual([]);
  });

  it('records a Russian error text and keeps the status on a failed send', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' }), row({ id: 'b' })]);
    const failing = vi
      .fn<(input: SendEmailInput) => Promise<Awaited<ReturnType<typeof okEmail>>>>()
      .mockResolvedValueOnce({ ok: false, reason: 'smtp 421' } as never)
      .mockRejectedValueOnce(new Error('сеть недоступна'));
    const result = await sendOutreach(NOW, deps(db, { email: failing }));
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: null, errors: 2 });
    expect(updates).toHaveLength(2);
    // The failure time is its own field: any later write moves updatedAt, not outreachErrorAt.
    // The letter certainly did not leave, so the claim taken before the send is released.
    expect(updates[0]!.data).toEqual({
      emailSentAt: null,
      outreachError: 'Письмо не отправлено: smtp 421',
      outreachErrorAt: expect.any(Date),
    });
    expect(updates[1]!.data).toEqual({
      emailSentAt: null,
      outreachError: 'Письмо не отправлено: сеть недоступна',
      outreachErrorAt: expect.any(Date),
    });
    expect(String(updates[0]!.data.outreachError).length).toBeLessThanOrEqual(300);
  });

  it('no SMTP at send time (К1): no letter, no error on the row, e-mail stops for the pass', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), contacted('r', 5)];
    const { db, updates } = fakeDb(rows);
    const skipping = vi.fn(async (_input: SendEmailInput) => ({
      ok: false as const,
      reason: 'no-smtp',
    }));
    const result = await sendOutreach(NOW, deps(db, { email: skipping }));
    expect(result).toMatchObject({ email: 0, followUps: 0, errors: 0, mail: 'no-smtp' });
    expect(skipping).toHaveBeenCalledTimes(1);
    // Only the claim is released: the row carries neither a sent mark nor an error.
    expect(updates).toEqual([{ id: 'a', data: { emailSentAt: null } }]);
    expect(rows[0]).toMatchObject({ emailSentAt: null, status: 'READY' });
  });

  it('stops when the time budget is spent', async () => {
    const { db } = fakeDb([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    let tick = 0;
    const clock = () => {
      tick += 1;
      // The pass start, the project start, the row check and the send check read 0; after one
      // send the budget is spent.
      return tick <= 4 ? 0 : OUTREACH_BUDGET_MS + 1;
    };
    const result = await sendOutreach(NOW, deps(db, { clock }));
    expect(result.email).toBe(1);
  });

  it('with no time left nothing is sent at all', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(NOW, deps(db, { budgetMs: 500 }));
    expect(result).toMatchObject({ email: 0, whatsapp: 0, skipped: 'no-time' });
    expect(updates).toHaveLength(0);
  });

  it('a prospect the owner published or declined during the pass is not written back to CONTACTED', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const { db, updates } = fakeDb(rows);
    const email = vi.fn(async (input: SendEmailInput) => {
      // «Согласился» arrives while the first letter is in flight.
      if (input.to === rows[0]!.email) rows[1]!.status = 'PUBLISHED';
      return { ok: true as const };
    });
    const result = await sendOutreach(NOW, deps(db, { email }));
    // The second row is re-checked before its send: nothing goes out and nothing is overwritten.
    expect(result.email).toBe(1);
    expect(rows[1]!.status).toBe('PUBLISHED');
    expect(updates.filter((u) => u.id === 'b')).toHaveLength(0);
  });

  it('asks the database for rows that have not failed today first', async () => {
    const seen: unknown[] = [];
    const { db } = fakeDb([row({ id: 'a' })]);
    const findMany = db.prospect.findMany.bind(db.prospect);
    db.prospect.findMany = async (args) => {
      seen.push(args);
      return findMany(args);
    };
    await sendOutreach(NOW, deps(db));
    expect(seen[0]).toMatchObject({
      where: {
        AND: [
          // Only rows with something left to send: no crowding of the batch by finished ones.
          {
            OR: [
              { emailSentAt: null, email: { not: null } },
              { whatsappSentAt: null, whatsapp: { startsWith: '+79' } },
            ],
          },
          // Not «NOT { gte }»: in SQL that is NULL for an empty column and drops every clean row.
          {
            OR: [{ outreachErrorAt: null }, { outreachErrorAt: { lt: mskDayBounds(NOW).start } }],
          },
        ],
      },
      orderBy: [{ outreachError: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
  });

  it('rows already written to in every channel do not take the batch from new ones', async () => {
    const done = Array.from({ length: 60 }, (_, i) =>
      contacted(`done${String(i).padStart(2, '0')}`, 1, { email: null, emailSentAt: null }),
    );
    const { db } = fakeDb([...done, row({ id: 'new' })]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result.email).toBe(1);
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['new@example.com']);
  });

  it('a row that failed yesterday is retried even if it was touched today', async () => {
    const yesterday = new Date(mskDayBounds(NOW).start.getTime() - 3_600_000);
    const failed: Row = {
      ...row({ id: 'a' }),
      outreachError: 'Письмо не отправлено: smtp 421',
      outreachErrorAt: yesterday,
    };
    const { db } = fakeDb([failed]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result.email).toBe(1);
  });

  it('a row starts only if all its sends fit in the time left', async () => {
    const { db } = fakeDb([row({ id: 'a' })]);
    // The first letter of a pass needs the mailbox check (8 s) and the send (8 s): 17 s is
    // enough for one letter, not for a letter plus WhatsApp.
    const result = await sendOutreach(NOW, deps(db, { budgetMs: 17_000 }));
    expect(result.email).toBe(1);
    const both = fakeDb([row({ id: 'b', whatsapp: '+79270000002' })]);
    okEmail.mockClear();
    const none = await sendOutreach(NOW, deps(both.db, { budgetMs: 17_000 }));
    expect(none).toMatchObject({ email: 0, whatsapp: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    // Without time for the mailbox check the letter does not start either.
    const short = fakeDb([row({ id: 'c' })]);
    const late = await sendOutreach(NOW, deps(short.db, { budgetMs: 9_000 }));
    expect(late.email).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });
});

describe('sendOutreach — reminders (S8)', () => {
  // К4: reminders go only through «письма дня» — the owner approves every row it would send.
  const approved = (fake: ReturnType<typeof fakeDb>, over: Record<string, unknown> = {}) =>
    deps(fake.db, { onlyApproved: fake.approveAll(), ...over });

  it('in auto mode the cron sends no reminders: e-mail replies are not read (К4)', async () => {
    const { db, updates } = fakeDb([contacted('a', 5)]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('followUpWindow: the first letter went 4 to 14 days ago', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(4);
    expect(followUpWindow(NOW)).toEqual({
      gte: daysAgo(FOLLOW_UP_MAX_DAYS),
      lte: daysAgo(FOLLOW_UP_AFTER_DAYS),
    });
  });

  it('sends one short reminder to a prospect who did not answer in 4 days, and marks it', async () => {
    const rows = [contacted('a', 5)];
    const fake = fakeDb(rows);
    const result = await sendOutreach(NOW, approved(fake));
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 1, skipped: null, errors: 0 });
    expect(okEmail).toHaveBeenCalledTimes(1);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.to).toBe('a@example.com');
    expect(sent.subject).toBe('Напоминаем: страница для «Компания a» готова');
    expect(sent.replyTo).toBe('office@example.com');
    // К3: «Больше не писать» in the letter and the one-click header for mail clients.
    expect(sent.headers).toEqual({
      'List-Unsubscribe': '<https://example.test/api/office/unsubscribe?t=tok-a&s=sig>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(sent.text).toContain('Больше не писать: https://example.test/otpiska/tok-a?s=sig');
    expect(sent.html).toContain('https://example.test/otpiska/tok-a?s=sig');
    expect(sent.text).toContain('Посмотрите — это 30 секунд.');
    expect(sent.text).toContain('https://example.test/preview/tok-a');
    expect(sent.text).toContain(
      'https://example.test/sajt-pod-klyuch?utm_source=email&utm_campaign=slug-a',
    );
    const lines = sent.text!.trim().split('\n').filter(Boolean);
    // The «стоп» line closes the letter; the signature and «Больше не писать» follow (К3).
    expect(lines[lines.length - 3]).toContain(STOP_LINE);
    expect(lines[lines.length - 1]).toMatch(/^Больше не писать: /);
    expect(okWhatsApp).not.toHaveBeenCalled();
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]!.data).toEqual({
      followUpSentAt: expect.any(Date),
      outreachError: null,
      outreachErrorAt: null,
    });
    // Only the reminder mark: the first letter's date and the status stay as they were.
    expect(rows[0]!.emailSentAt).toEqual(daysAgo(5));
    expect(rows[0]!.status).toBe('CONTACTED');

    // Once: the next pass does not write again.
    okEmail.mockClear();
    const again = await sendOutreach(NOW, approved(fake));
    expect(again.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('skips too early, too old, answered, already reminded, without e-mail and other statuses', async () => {
    const fake = fakeDb([
      contacted('early', 3),
      contacted('old', FOLLOW_UP_MAX_DAYS + 1),
      contacted('replied', 6, { repliedAt: daysAgo(2) }),
      contacted('reminded', 9, { followUpSentAt: daysAgo(2) }),
      contacted('no-email', 6, { email: null }),
      contacted('blank-email', 6, { email: '  ' }),
      ...['READY', 'CALLBACK', 'AGREED', 'PUBLISHED', 'DECLINED', 'REGISTERED'].map((status) =>
        contacted(status, 6, { status, email: null }),
      ),
    ]);
    const result = await sendOutreach(NOW, approved(fake));
    expect(result).toMatchObject({ email: 0, followUps: 0, errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });

  it('a declined, agreed or published prospect with an old letter gets no reminder', async () => {
    const fake = fakeDb(
      ['CALLBACK', 'AGREED', 'PUBLISHED', 'DECLINED', 'REGISTERED'].map((status) =>
        contacted(status, 6, { status }),
      ),
    );
    const result = await sendOutreach(NOW, approved(fake));
    expect(result.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('asks the database for exactly the due reminders, oldest letter first', async () => {
    const seen: Parameters<OutreachDb['prospect']['findMany']>[0][] = [];
    const fake = fakeDb([contacted('a', 5)]);
    const findMany = fake.db.prospect.findMany.bind(fake.db.prospect);
    fake.db.prospect.findMany = async (args) => {
      seen.push(args);
      return findMany(args);
    };
    await sendOutreach(NOW, approved(fake));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({
      where: {
        status: { in: ['CONTACTED'] },
        emailSentAt: followUpWindow(NOW),
        email: { not: null },
        followUpSentAt: null,
        repliedAt: null,
        AND: [
          {
            OR: [{ outreachErrorAt: null }, { outreachErrorAt: { lt: mskDayBounds(NOW).start } }],
          },
        ],
      },
      orderBy: { emailSentAt: 'asc' },
      take: 50,
    });
  });

  it('first letters go first; reminders share the daily e-mail cap and count towards it', async () => {
    const fake = fakeDb([
      row({ id: 'new', kind: 'provider' }),
      contacted('r1', 6),
      contacted('r2', 5),
    ]);
    const result = await sendOutreach(NOW, approved(fake, { settings: settings({ dailyCap: 2 }) }));
    expect(result).toMatchObject({ email: 1, followUps: 1 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['new@example.com', 'r1@example.com']);
  });

  it('reminders sent earlier today use up the cap for first letters too', async () => {
    const { start } = mskDayBounds(NOW);
    // Дневное окно лимита — с 8:00 по Москве: считаются письма, ушедшие в нём.
    const earlierToday = new Date(start.getTime() + 9 * 3_600_000);
    const fake = fakeDb([
      contacted('done1', 6, { followUpSentAt: earlierToday }),
      contacted('done2', 7, { followUpSentAt: earlierToday }),
      row({ id: 'new', kind: 'provider' }),
      contacted('due', 5),
    ]);
    const result = await sendOutreach(
      LATER,
      approved(fake, { settings: settings({ dailyCap: 2 }) }),
    );
    expect(result).toMatchObject({ email: 0, followUps: 0 });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('no WhatsApp reminders: a prospect written to only in WhatsApp gets nothing more', async () => {
    const fake = fakeDb([
      contacted('wa', 6, {
        email: null,
        emailSentAt: null,
        whatsapp: '+79271112233',
        whatsappSentAt: daysAgo(6),
      }),
      contacted('both', 6, { whatsapp: '+79271112244', whatsappSentAt: daysAgo(6) }),
    ]);
    const result = await sendOutreach(NOW, approved(fake));
    expect(result).toMatchObject({ whatsapp: 0, followUps: 1 });
    expect(okWhatsApp).not.toHaveBeenCalled();
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['both@example.com']);
  });

  it('no reminders while e-mail is not configured on the server', async () => {
    const fake = fakeDb([contacted('a', 5)]);
    const result = await sendOutreach(
      NOW,
      approved(fake, { channels: () => ({ email: false, whatsapp: true }) }),
    );
    expect(result.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('nothing while the outreach is paused', async () => {
    const fake = fakeDb([contacted('a', 5)]);
    const result = await sendOutreach(
      NOW,
      approved(fake, { settings: settings({ outreachPaused: true }) }),
    );
    expect(result).toMatchObject({ followUps: 0, skipped: 'paused' });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('a failed reminder is an error with a Russian text, retried not before tomorrow', async () => {
    const rows: Row[] = [contacted('a', 5)];
    const fake = fakeDb(rows);
    const failing = vi.fn(async (_input: SendEmailInput) => ({
      ok: false as const,
      reason: 'smtp 421',
    }));
    const result = await sendOutreach(NOW, approved(fake, { email: failing }));
    expect(result).toMatchObject({ followUps: 0, errors: 1 });
    expect(fake.updates).toEqual([
      {
        id: 'a',
        data: {
          followUpSentAt: null,
          outreachError: 'Напоминание не отправлено: smtp 421',
          outreachErrorAt: expect.any(Date),
        },
      },
    ]);
    expect(rows[0]!.followUpSentAt).toBeNull();
    // Same day: the failed row is not picked again.
    const again = await sendOutreach(NOW, approved(fake, { email: failing }));
    expect(again.errors).toBe(0);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('a send that times out or throws is an error, not a reminder', async () => {
    const fake = fakeDb([contacted('a', 5)]);
    const throwing = vi.fn(async (_input: SendEmailInput): Promise<never> => {
      throw new Error('сеть недоступна');
    });
    const result = await sendOutreach(NOW, approved(fake, { email: throwing }));
    expect(result).toMatchObject({ followUps: 0, errors: 1 });
    expect(fake.updates[0]!.data).toEqual({
      followUpSentAt: null,
      outreachError: outreachErrorText('followUp', 'сеть недоступна'),
      outreachErrorAt: expect.any(Date),
    });
  });

  it('the mark is written only while the prospect is still CONTACTED', async () => {
    const rows = [contacted('a', 5)];
    const fake = fakeDb(rows);
    const email = vi.fn(async (_input: SendEmailInput) => {
      // The owner presses «Согласился» while the reminder is in flight.
      rows[0]!.status = 'AGREED';
      return { ok: true as const };
    });
    const result = await sendOutreach(NOW, approved(fake, { email }));
    expect(result.followUps).toBe(1);
    expect(rows[0]!.status).toBe('AGREED');
    // The reminder did leave, and the claim taken before the send says so; nothing else is
    // written over the owner's «Согласился».
    expect(rows[0]!.followUpSentAt).toBeInstanceOf(Date);
    expect(fake.updates).toEqual([]);
  });

  it('stays within the time budget: no reminder pass when the first pass used it up', async () => {
    const fake = fakeDb([row({ id: 'a', kind: 'provider' }), contacted('r', 5)]);
    let now = 0;
    // Every send takes the whole budget.
    const slowEmail = vi.fn(async (_input: SendEmailInput) => {
      now += OUTREACH_BUDGET_MS + 1;
      return { ok: true as const };
    });
    const result = await sendOutreach(NOW, approved(fake, { clock: () => now, email: slowEmail }));
    expect(result).toMatchObject({ email: 1, followUps: 0 });
    expect(slowEmail.mock.calls.map((c) => c[0].to)).toEqual(['a@example.com']);
  });

  it('stops between reminders when the time budget runs out', async () => {
    const fake = fakeDb([contacted('r1', 6), contacted('r2', 5)]);
    let now = 0;
    const slowEmail = vi.fn(async (_input: SendEmailInput) => {
      now += OUTREACH_BUDGET_MS + 1;
      return { ok: true as const };
    });
    const result = await sendOutreach(NOW, approved(fake, { clock: () => now, email: slowEmail }));
    expect(result.followUps).toBe(1);
    expect(slowEmail.mock.calls.map((c) => c[0].to)).toEqual(['r1@example.com']);
  });
});

describe('sendOutreach — personal offer (U2)', () => {
  const dossier: Dossier = {
    v: 1,
    niche: 'dentist',
    nicheTitle: 'Стоматология',
    city: 'Казань',
    facts: ['адрес: ул. Баумана, 10', 'часы: пн-пт 09:00-21:00'],
    hours: { lateClose: '21:00', weekends: false, roundTheClock: false },
    competitors: { radiusKm: 2, sameNiche: 4, withSite: 3 },
    channels: { email: true, whatsapp: true, telegram: false },
    gaps: ['нет своего сайта'],
  };
  const withDossier = (over: Partial<OutreachRow> & { id: string }) =>
    row({ dossierJson: JSON.stringify(dossier), whatsapp: '+79170000001', ...over });
  const noAi = vi.fn(async (o: SentOffer) => o);

  beforeEach(() => noAi.mockClear());

  it('builds the letter and WhatsApp from the dossier offer and records the angle and the offer', async () => {
    const { db, updates } = fakeDb([withDossier({ id: 'a' })]);
    // Every angle is fresh: the first applicable one is chosen.
    const result = await sendOutreach(NOW, deps(db, { improve: noAi, random: () => 0.99 }));
    expect(result).toMatchObject({ email: 1, whatsapp: 1, errors: 0 });
    const expected = buildOffer({
      dossier,
      angle: 'competitors_have_sites',
      companyName: 'Компания a',
    });
    const letter = okEmail.mock.calls[0]![0];
    expect(letter.subject).toBe(expected.subject);
    expect(letter.text).toContain(expected.opener);
    for (const bullet of expected.bullets) expect(letter.text).toContain(`• ${bullet}`);
    // The package and its price stay on the service page: the first letter has no prices.
    expect(letter.text).not.toContain('₽');
    expect(letter.text).toContain(NOT_OFFER_LINE);
    expect(letter.text).toContain(`— ${LEGAL_SIGNATURE}`);
    expect(letter.text).toContain('https://example.test/preview/tok-a');
    expect(letter.text).toContain('Кто мы и цены: ');
    const lines = letter.text!.trim().split('\n').filter(Boolean);
    // The «стоп» line closes the letter; the signature and «Больше не писать» follow (К3).
    expect(lines[lines.length - 3]).toContain(STOP_LINE);
    expect(lines[lines.length - 1]).toMatch(/^Больше не писать: /);
    const wa = okWhatsApp.mock.calls[0]![1];
    expect(wa).toContain(expected.opener);
    expect(wa).toContain('https://example.test/preview/tok-a');
    expect(wa).not.toContain('₽');
    expect(wa).toContain('сообщение не является офертой');
    expect(wa.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(wa.split('\n\n').pop()!.startsWith(STOP_LINE)).toBe(true);
    for (const u of updates) {
      expect(u.data.offerAngle).toBe('competitors_have_sites');
      expect(JSON.parse(u.data.offerJson as string)).toMatchObject({
        angle: 'competitors_have_sites',
        subject: expected.subject,
        ai: false,
      });
    }
    expect(noAi).not.toHaveBeenCalled();
  });

  it('learning: angles with fewer trials go first', async () => {
    const old = new Date('2026-10-01T10:00:00+03:00');
    const history: Row[] = [];
    for (let i = 0; i < 6; i++) {
      history.push({
        ...row({ id: `h${i}`, status: 'PUBLISHED', contactedAt: old }),
        offerAngle: 'competitors_have_sites',
      });
    }
    const { db, updates } = fakeDb([...history, withDossier({ id: 'a', whatsapp: null })]);
    await sendOutreach(NOW, deps(db, { improve: noAi }));
    expect(updates[0]!.data.offerAngle).toBe('open_late');
  });

  it('a provider letter stays as it was: no offer, no angle written', async () => {
    const { db, updates } = fakeDb([withDossier({ id: 'a', kind: 'provider', whatsapp: null })]);
    await sendOutreach(NOW, deps(db, { improve: noAi }));
    expect(okEmail.mock.calls[0]![0].text).not.toContain('Что даст страница');
    expect(updates[0]!.data).not.toHaveProperty('offerAngle');
    expect(updates[0]!.data).not.toHaveProperty('offerJson');
  });

  it('the second channel reuses the offer already sent', async () => {
    const sentOffer = {
      ...buildOffer({ dossier, angle: 'open_late', companyName: 'Компания a' }),
      opener: 'Записанное вступление для этой компании.',
      ai: true,
    };
    const { db } = fakeDb([
      withDossier({
        id: 'a',
        status: 'CONTACTED',
        emailSentAt: new Date('2026-11-08T10:00:00+03:00'),
        contactedAt: new Date('2026-11-08T10:00:00+03:00'),
        offerJson: JSON.stringify(sentOffer),
      }),
    ]);
    const improve = vi.fn(async (o: SentOffer) => o);
    await sendOutreach(NOW, deps(db, { improve, settings: settings({ aiOffers: true }) }));
    expect(okWhatsApp.mock.calls[0]![1]).toContain('Записанное вступление для этой компании.');
    expect(improve).not.toHaveBeenCalled();
  });

  it('the second channel does not repeat a sent offer whose angle no longer follows from the dossier', async () => {
    // The e-mail went out with «работаете в выходные», but the card says пн-пт only.
    const sentOffer = {
      ...buildOffer({ dossier, angle: 'weekends', companyName: 'Компания a' }),
      ai: false,
    };
    const { db } = fakeDb([
      withDossier({
        id: 'a',
        status: 'CONTACTED',
        emailSentAt: new Date('2026-11-08T10:00:00+03:00'),
        contactedAt: new Date('2026-11-08T10:00:00+03:00'),
        offerJson: JSON.stringify(sentOffer),
      }),
    ]);
    await sendOutreach(NOW, deps(db, { improve: noAi }));
    expect(okWhatsApp).toHaveBeenCalledTimes(1);
    expect(okWhatsApp.mock.calls[0]![1]).not.toContain('в выходные');
  });

  it('AI rewrites only when switched on, within the daily cap counted from today', async () => {
    const improve = vi.fn(async (o: SentOffer) => ({
      ...o,
      opener: 'Переписанное вступление про вашу клинику рядом с соседями.',
      ai: true,
    }));
    const today = new Date('2026-11-09T07:00:00+03:00');
    const usedToday = row({
      id: 'u',
      status: 'PUBLISHED',
      contactedAt: today,
      offerJson: '{"angle":"search","ai":true}',
    });
    const { db, updates } = fakeDb([
      usedToday,
      withDossier({ id: 'a', whatsapp: null }),
      withDossier({ id: 'b', whatsapp: null }),
      withDossier({ id: 'c', whatsapp: null }),
    ]);
    const result = await sendOutreach(
      NOW,
      deps(db, { improve, settings: settings({ aiOffers: true, aiDailyCap: 2 }) }),
    );
    expect(result.email).toBe(3);
    expect(improve).toHaveBeenCalledTimes(1);
    expect(okEmail.mock.calls[0]![0].text).toContain('Переписанное вступление');
    expect(JSON.parse(updates[0]!.data.offerJson as string).ai).toBe(true);
    expect(JSON.parse(updates[1]!.data.offerJson as string).ai).toBe(false);
    expect(okEmail.mock.calls[1]![0].text).not.toContain('Переписанное вступление');
  });

  it('AI switched off: never called; a failing AI falls back to the plain offer', async () => {
    const { db } = fakeDb([withDossier({ id: 'a', whatsapp: null })]);
    const improve = vi.fn(async (o: SentOffer) => o);
    await sendOutreach(NOW, deps(db, { improve }));
    expect(improve).not.toHaveBeenCalled();

    const { db: db2, updates } = fakeDb([withDossier({ id: 'b', whatsapp: null })]);
    const broken = vi.fn(async (_o: SentOffer): Promise<SentOffer> => {
      throw new Error('boom');
    });
    const result = await sendOutreach(
      NOW,
      deps(db2, { improve: broken, settings: settings({ aiOffers: true }) }),
    );
    expect(broken).toHaveBeenCalledTimes(1);
    expect(result.email).toBe(1);
    expect(JSON.parse(updates[0]!.data.offerJson as string).ai).toBe(false);
  });

  it('a failed send writes no angle', async () => {
    const { db, updates } = fakeDb([withDossier({ id: 'a', whatsapp: null })]);
    const failing = vi.fn(async () => ({ ok: false as const, reason: 'x' }));
    await sendOutreach(NOW, deps(db, { email: failing, improve: noAi }));
    expect(updates[0]!.data).not.toHaveProperty('offerAngle');
  });
});

describe('К1: только свой ящик, никогда Resend', () => {
  it('without SMTP in the environment nothing goes out and no row gets an error', async () => {
    vi.stubEnv('OUTREACH_SMTP_USER', '');
    vi.stubEnv('OUTREACH_SMTP_PASS', '');
    const { db, updates } = fakeDb([row({ id: 'a' }), contacted('r', 5)]);
    const rest: Record<string, unknown> = deps(db);
    delete rest.email;
    delete rest.channels;
    const result = await sendOutreach(NOW, rest as never);
    expect(result).toMatchObject({ email: 0, followUps: 0, errors: 0, mail: 'no-smtp' });
    expect(updates).toEqual([]);
    expect(resendSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('even with the e-mail channel forced on, the default sender is SMTP, not Resend', async () => {
    vi.stubEnv('OUTREACH_SMTP_USER', '');
    vi.stubEnv('OUTREACH_SMTP_PASS', '');
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const rest: Record<string, unknown> = deps(db);
    delete rest.email;
    const result = await sendOutreach(NOW, rest as never);
    expect(result).toMatchObject({ email: 0, errors: 0, mail: 'no-smtp' });
    expect(resendSpy).not.toHaveBeenCalled();
    expect(updates).toEqual([{ id: 'a', data: { emailSentAt: null } }]);
    vi.unstubAllEnvs();
  });
});

describe('К2: письма дня ждут утверждения владельцем', () => {
  const approve = settings({ outreachMode: 'approve' });

  it('in approve mode (the default) the cron pass sends nothing and prepares the offers', async () => {
    const rows = [row({ id: 'a' }), contacted('r', 5)];
    const { db, updates } = fakeDb(rows);
    const result = await sendOutreach(NOW, deps(db, { settings: approve }));
    expect(result).toMatchObject({ email: 0, whatsapp: 0, followUps: 0, skipped: 'approve' });
    expect(result.waiting).toBe(2);
    expect(okEmail).not.toHaveBeenCalled();
    expect(okWhatsApp).not.toHaveBeenCalled();
    // The offer is stored (what is approved is what goes), the status stays READY.
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data).toEqual({
      offerAngle: expect.any(String),
      offerJson: expect.any(String),
    });
    expect(rows[0]!.status).toBe('READY');
    expect(rows[0]!.emailSentAt).toBeNull();
  });

  it('a mode not set at all means approve', async () => {
    const { db } = fakeDb([row({ id: 'a' })]);
    const plain: OutreachRunSettings = await settings()();
    delete plain.outreachMode;
    const result = await sendOutreach(NOW, deps(db, { settings: async () => plain }));
    expect(result.skipped).toBe('approve');
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('planOutreach lists whom, subject, opener and points, reminders too, within the daily cap', async () => {
    const { db } = fakeDb([
      row({ id: 'a', whatsapp: '+79170000001' }),
      row({ id: 'p', kind: 'provider' }),
      row({ id: 'c' }),
      contacted('r', 5),
    ]);
    const plan = await planOutreach(NOW, deps(db, { settings: settings({ dailyCap: 3 }) }));
    expect(plan.skipped).toBeNull();
    expect(plan.items.map((i) => [i.id, i.type])).toEqual([
      ['a', 'first'],
      ['p', 'first'],
      ['c', 'first'],
    ]);
    const a = plan.items[0]!;
    expect(a).toMatchObject({ name: 'Компания a', city: 'Казань', email: 'a@example.com' });
    expect(a.whatsapp).toBe(true);
    expect(a.subject.length).toBeGreaterThan(0);
    expect(a.opener.length).toBeGreaterThan(0);
    expect(a.bullets.length).toBeGreaterThan(0);
    expect(plan.items[1]!.bullets).toEqual([]);
    expect(okEmail).not.toHaveBeenCalled();

    const roomy = fakeDb([contacted('r', 5)]);
    const reminders = await planOutreach(NOW, deps(roomy.db));
    expect(reminders.items).toEqual([
      expect.objectContaining({ id: 'r', type: 'followUp', email: 'r@example.com' }),
    ]);
  });

  it('the owner click sends only the approved rows, with the offer the owner saw', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' }), contacted('r', 5)];
    const { db } = fakeDb(rows);
    const plan = await planOutreach(NOW, deps(db, { settings: approve }));
    const shown = plan.items.find((i) => i.id === 'a')!;
    const reminder = plan.items.find((i) => i.id === 'r')!;
    expect(shown.approve).toEqual([approvalKey('a', 'email', 'first')]);
    expect(reminder.approve).toEqual([approvalKey('r', 'email', 'followUp')]);
    // A new company appears after the page was opened: it is not in the approved list.
    rows.push(row({ id: 'late' }));
    const result = await sendOutreach(
      NOW,
      deps(db, { settings: approve, onlyApproved: [...shown.approve, ...reminder.approve] }),
    );
    expect(result).toMatchObject({ email: 1, followUps: 1, skipped: null });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['a@example.com', 'r@example.com']);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.subject).toBe(shown.subject);
    expect(sent.text).toContain(shown.opener);
    expect(rows.find((r) => r.id === 'b')!.status).toBe('READY');
    expect(rows.find((r) => r.id === 'late')!.status).toBe('READY');
  });

  it('approval is per channel: a letter shown without WhatsApp does not go to WhatsApp', async () => {
    const rows = [row({ id: 'a', whatsapp: '+79270000001' })];
    const { db } = fakeDb(rows);
    // The page was opened while WhatsApp was not connected: the owner saw an e-mail only.
    const plan = await planOutreach(
      NOW,
      deps(db, { settings: approve, channels: () => ({ email: true, whatsapp: false }) }),
    );
    expect(plan.items[0]!.whatsapp).toBe(false);
    const result = await sendOutreach(
      NOW,
      deps(db, { settings: approve, onlyApproved: plan.items[0]!.approve }),
    );
    expect(result).toMatchObject({ email: 1, whatsapp: 0 });
    expect(okWhatsApp).not.toHaveBeenCalled();
  });

  it('approving a reminder does not send a first message in another channel', async () => {
    const rows = [contacted('r', 5, { whatsapp: '+79270000001' })];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(
      NOW,
      deps(db, { settings: approve, onlyApproved: [approvalKey('r', 'email', 'followUp')] }),
    );
    expect(result).toMatchObject({ followUps: 1, whatsapp: 0 });
    expect(okWhatsApp).not.toHaveBeenCalled();
  });

  it('an approved site row without a prepared offer is not sent (nothing unseen goes out)', async () => {
    const { db } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(
      NOW,
      deps(db, { onlyApproved: [approvalKey('a', 'email', 'first')] }),
    );
    expect(result.email).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('paused: no list, nothing prepared', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const plan = await planOutreach(
      NOW,
      deps(db, { settings: settings({ outreachPaused: true }) }),
    );
    expect(plan).toEqual({ items: [], skipped: 'paused' });
    expect(updates).toEqual([]);
  });
});

describe('К3: отписанный адрес не получает ничего', () => {
  it('a row whose address was unsubscribed anywhere is declined, not written to in any channel', async () => {
    const rows = [
      row({ id: 'a', email: 'Same@Example.com', whatsapp: '+79170000001' }),
      row({ id: 'b', kind: 'provider' }),
      contacted('r', 5, { email: 'same@example.com' }),
    ];
    const { db, approveAll } = fakeDb(rows);
    const optedOut = vi.fn(async (emails: string[]) => {
      expect(emails).toContain('same@example.com');
      return { emails: new Set(['same@example.com']), phones: new Set<string>() };
    });
    // Everything approved — still nothing goes to the unsubscribed address, reminder included.
    const result = await sendOutreach(NOW, deps(db, { optedOut, onlyApproved: approveAll() }));
    expect(result).toMatchObject({ email: 1, whatsapp: 0, followUps: 0, optedOut: 2 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['b@example.com']);
    expect(okWhatsApp).not.toHaveBeenCalled();
    for (const id of ['a', 'r']) {
      const r = rows.find((x) => x.id === id)! as Row & { optOutAt?: Date };
      expect(r.status).toBe('DECLINED');
      expect(r.optOutAt).toBeInstanceOf(Date);
    }
  });

  it('nor is it in the letters of the day', async () => {
    const { db } = fakeDb([row({ id: 'a' }), row({ id: 'b' })]);
    const plan = await planOutreach(
      NOW,
      deps(db, {
        optedOut: async () => ({ emails: new Set(['a@example.com']), phones: new Set<string>() }),
      }),
    );
    expect(plan.items.map((i) => i.id)).toEqual(['b']);
    expect(plan.optedOut).toBe(1);
  });

  it('a number that said «стоп» (or was declined) gets nothing, whatever the e-mail', async () => {
    const rows = [
      row({ id: 'a', email: 'new@example.com', whatsapp: '+79170000001' }),
      row({ id: 'b', phone: '+79170000001' }),
      row({ id: 'c' }),
    ];
    const { db } = fakeDb(rows);
    const optedOut = vi.fn(async (_emails: string[], phones: string[]) => {
      expect(phones).toContain('+79170000001');
      return { emails: new Set<string>(), phones: new Set(['+79170000001']) };
    });
    const result = await sendOutreach(NOW, deps(db, { optedOut }));
    expect(result).toMatchObject({ email: 1, whatsapp: 0, optedOut: 2 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['c@example.com']);
    expect(okWhatsApp).not.toHaveBeenCalled();
  });

  it('no unsubscribe link (no secret) — the letter does not go', async () => {
    const { db } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(NOW, deps(db, { unsubscribe: () => null }));
    expect(result.email).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });
});

describe('markReplied', () => {
  it('marks repliedAt for the prospect whose WhatsApp or phone ends with the number', async () => {
    const { db, updates } = fakeDb([
      row({ id: 'a', status: 'CONTACTED', whatsapp: '+79271112233' }),
      row({ id: 'b', status: 'CONTACTED', phone: '+79270000002' }),
      row({ id: 'c', status: 'CONTACTED', phone: '+79270000003' }),
    ]);
    expect(await markReplied('79271112233', 'Интересно, расскажите', NOW, db)).toEqual({
      matched: true,
      stopped: false,
    });
    expect(await markReplied('+7 (927) 000-00-02', 'Да', NOW, db)).toEqual({
      matched: true,
      stopped: false,
    });
    expect(updates.map((u) => u.id)).toEqual(['a', 'b']);
    expect(updates[0]!.data).toEqual({ repliedAt: NOW });
    expect(await markReplied('79990000000', 'Да', NOW, db)).toEqual({
      matched: false,
      stopped: false,
    });
    expect(await markReplied('123', 'Да', NOW, db)).toEqual({ matched: false, stopped: false });
  });

  it('«стоп» declines the prospect', async () => {
    const { db, updates } = fakeDb([row({ id: 'a', status: 'CONTACTED', phone: '+79270000001' })]);
    expect(await markReplied('79270000001', 'Стоп, не пишите', NOW, db)).toEqual({
      matched: true,
      stopped: true,
    });
    // К3: «стоп» is an opt-out — neither this number nor its e-mail gets anything again.
    expect(updates[0]!.data).toEqual({
      repliedAt: NOW,
      status: 'DECLINED',
      declinedAt: NOW,
      optOutAt: NOW,
    });
  });

  it('ignores prospects that are already published, declined or registered', async () => {
    const { db, updates } = fakeDb([
      row({ id: 'a', status: 'PUBLISHED', phone: '+79270000001' }),
      row({ id: 'b', status: 'DECLINED', phone: '+79270000001' }),
    ]);
    expect(await markReplied('79270000001', 'стоп', NOW, db)).toEqual({
      matched: false,
      stopped: false,
    });
    expect(updates).toEqual([]);
  });
});

describe('один адрес — одно первое сообщение (ревью 2026-11-10)', () => {
  const none = { emails: new Map<string, Date>(), phones: new Map<string, Date>() };

  it('письма дня: у двух фирм одна почта — владелец видит одно письмо, в базе ничего не помечается', async () => {
    const rows = [
      row({ id: 'a', email: 'info@mail.ru' }),
      row({ id: 'b', email: ' Info@Mail.ru ', phone: '+78432001133' }),
      row({ id: 'c' }),
    ];
    const { db, claims } = fakeDb(rows);
    const plan = await planOutreach(NOW, deps(db));
    expect(plan.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(claims).toEqual([]);
    expect(rows[1]!.emailSentAt).toBeNull();
  });

  it('отправка: второй строке с той же почтой письмо не уходит, её канал закрыт датой первого', async () => {
    const rows = [
      row({ id: 'a', email: 'info@mail.ru' }),
      row({ id: 'b', email: 'INFO@mail.ru', phone: '+78432001133' }),
    ];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toMatchObject({ email: 1, errors: 0, duplicates: 1 });
    expect(okEmail).toHaveBeenCalledTimes(1);
    expect(okEmail.mock.calls[0]![0].to).toBe('info@mail.ru');
    expect(rows[0]).toMatchObject({ status: 'CONTACTED' });
    // Дубль не «написан»: статус и contactedAt прежние, закрыт только канал почты — особой
    // отметкой вне любых окон дат: дневной лимит и «отправлено сегодня» он не трогает.
    expect(rows[1]).toMatchObject({ status: 'READY', contactedAt: null });
    expect(rows[1]!.emailSentAt).toEqual(DUPLICATE_CLOSED_AT);
    expect(isDuplicateMark(rows[1]!.emailSentAt)).toBe(true);
    expect(isDuplicateMark(rows[0]!.emailSentAt)).toBe(false);
    // Следующий проход дубль уже не берёт.
    const again = await sendOutreach(NOW, deps(db));
    expect(again).toMatchObject({ email: 0 });
    expect(okEmail).toHaveBeenCalledTimes(1);
  });

  it('адресу писали раньше в другой строке (в базе) — не пишем ни в «письмах дня», ни при отправке', async () => {
    const before = new Date('2026-11-08T10:00:00+03:00');
    const contactedBefore = vi.fn(async (_emails: string[], _phones: string[]) => ({
      emails: new Map([['info@mail.ru', before]]),
      phones: new Map<string, Date>(),
    }));
    const rows = [row({ id: 'b', email: 'info@mail.ru' }), row({ id: 'c' })];
    const { db } = fakeDb(rows);
    const plan = await planOutreach(NOW, deps(db, { contacted: contactedBefore }));
    expect(contactedBefore.mock.calls[0]![0]).toContain('info@mail.ru');
    expect(plan.items.map((i) => i.id)).toEqual(['c']);
    // Канал дубля закрыт отметкой дубля — в очередь он больше не попадёт.
    expect(rows[0]!.emailSentAt).toEqual(DUPLICATE_CLOSED_AT);
    expect(rows[0]).toMatchObject({ status: 'READY', contactedAt: null });
    const result = await sendOutreach(NOW, deps(db, { contacted: contactedBefore }));
    expect(result).toMatchObject({ email: 1 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['c@example.com']);
  });

  it('WhatsApp: один номер у двух карточек — одно сообщение', async () => {
    const rows = [
      row({ id: 'a', email: null, whatsapp: '+79271112233' }),
      row({ id: 'b', email: null, phone: '+78432001133', whatsapp: '+79271112233' }),
    ];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toMatchObject({ whatsapp: 1, duplicates: 1 });
    expect(okWhatsApp).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ status: 'CONTACTED' });
    expect(rows[1]!.whatsappSentAt).toEqual(DUPLICATE_CLOSED_AT);
    expect(rows[1]).toMatchObject({ status: 'READY', contactedAt: null });
  });

  it('дубли не съедают дневной лимит и не получают напоминаний', async () => {
    const rows = [
      row({ id: 'a', email: 'info@mail.ru' }),
      row({ id: 'b', email: 'info@mail.ru', phone: '+78432001133' }),
      row({ id: 'c', email: 'info@mail.ru', phone: '+78432001144' }),
      row({ id: 'd' }),
    ];
    const { db } = fakeDb(rows);
    // Лимит 2 в день: письмо «a», два закрытых дубля и ещё одно письмо — «d».
    const result = await sendOutreach(NOW, deps(db, { settings: settings({ dailyCap: 2 }) }));
    expect(result).toMatchObject({ email: 2, duplicates: 2 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['info@mail.ru', 'd@example.com']);
    // Дубль позже отметили «написали в WhatsApp» (CONTACTED): напоминание ему не уходит —
    // его отметка почты вне окна «4–14 дней назад».
    rows[1]!.status = 'CONTACTED';
    // Письма «a» и «d» ушли пять дней назад — пора напомнить им, и только им.
    rows[0]!.emailSentAt = daysAgo(5);
    rows[3]!.emailSentAt = daysAgo(5);
    const plan = await planOutreach(NOW, deps(db));
    expect(plan.items.filter((i) => i.type === 'followUp').map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('пометка «письмо могло уйти» остаётся и после отправки WhatsApp той же строке', async () => {
    vi.useFakeTimers();
    try {
      const rows = [row({ id: 'a', whatsapp: '+79271112233' })];
      const { db } = fakeDb(rows);
      const hanging = vi.fn((_input: SendEmailInput) => new Promise<never>(() => {}));
      const pass = sendOutreach(NOW, deps(db, { email: hanging, budgetMs: 60_000 }));
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 10);
      const result = await pass;
      expect(result).toMatchObject({ email: 0, whatsapp: 1, errors: 1 });
      expect(String((rows[0] as { outreachError?: string }).outreachError)).toContain(
        DELIVERY_UNKNOWN,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('кнопку нажали дважды: второй проход во время первого не отправляет те же письма', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const { db } = fakeDb(rows);
    const sentTo: string[] = [];
    let nested = false;
    const email = vi.fn(async (input: SendEmailInput) => {
      sentTo.push(input.to);
      if (!nested) {
        nested = true;
        // Пока первое письмо первого прохода в пути, стартует второй проход по той же базе.
        await sendOutreach(NOW, deps(db, { email, contacted: async () => none }));
      }
      return { ok: true as const };
    });
    await sendOutreach(NOW, deps(db, { email, contacted: async () => none }));
    expect(sentTo.sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('сервер не подтвердил отправку: второй раз не пишем, у фирмы пометка для владельца', async () => {
    vi.useFakeTimers();
    try {
      const rows = [row({ id: 'a' })];
      const { db } = fakeDb(rows);
      const hanging = vi.fn((_input: SendEmailInput) => new Promise<never>(() => {}));
      const pass = sendOutreach(NOW, deps(db, { email: hanging, budgetMs: 60_000 }));
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 10);
      const result = await pass;
      expect(result).toMatchObject({ email: 0, errors: 1 });
      expect(rows[0]).toMatchObject({ status: 'CONTACTED' });
      expect(rows[0]!.emailSentAt).toBeInstanceOf(Date);
      expect(String((rows[0] as { outreachError?: string }).outreachError)).toContain(
        DELIVERY_UNKNOWN,
      );
      const again = await sendOutreach(NOW, deps(db, { email: hanging }));
      expect(again).toMatchObject({ email: 0, errors: 0 });
      expect(hanging).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('режим «сам по расписанию»: офис пишет только днём по Москве (владелец, 2026-11-11)', () => {
  const at = (msk: string) => new Date(`2026-11-11T${msk}:00+03:00`);

  it('часы отправки: с 8:00 до 19:59 по Москве, в любой день', () => {
    expect(AUTO_SEND_HOURS).toEqual({ from: 8, to: 20 });
    expect(inAutoSendHours(at('07:59'))).toBe(false);
    expect(inAutoSendHours(at('08:00'))).toBe(true);
    expect(inAutoSendHours(at('13:30'))).toBe(true);
    expect(inAutoSendHours(at('19:59'))).toBe(true);
    expect(inAutoSendHours(at('20:00'))).toBe(false);
    expect(inAutoSendHours(at('03:13'))).toBe(false);
    // Час считается по Москве, а не по часам сервера: 05:13 UTC — это 08:13 в Москве.
    expect(inAutoSendHours(new Date('2026-11-11T05:13:00Z'))).toBe(true);
    expect(inAutoSendHours(new Date('2026-11-11T17:00:00Z'))).toBe(false);
  });

  it('ночью крон ничего не отправляет и строк не трогает; днём — отправляет', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const { db, updates, claims } = fakeDb(rows);
    const night = await sendOutreach(at('05:13'), deps(db));
    expect(night).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: 'night', errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(claims).toEqual([]);
    const day = await sendOutreach(at('10:39'), deps(db));
    expect(day).toMatchObject({ email: 2, skipped: null });
    expect(okEmail).toHaveBeenCalledTimes(2);
  });

  it('кнопка владельца работает и ночью: утверждённое уходит', async () => {
    const rows = [row({ id: 'a' })];
    const fake = fakeDb(rows);
    // Письмо дня подготовлено (предложение записано), владелец нажал «Отправить» в 23:30.
    await planOutreach(at('23:30'), deps(fake.db));
    const result = await sendOutreach(
      at('23:30'),
      deps(fake.db, { onlyApproved: fake.approveAll() }),
    );
    expect(result).toMatchObject({ email: 1, skipped: null });
  });

  it('в режиме «с утверждением» время суток не важно: письма только готовятся', async () => {
    const rows = [row({ id: 'a' })];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(
      at('03:00'),
      deps(db, { settings: settings({ outreachMode: 'approve' }) }),
    );
    expect(result).toMatchObject({ email: 0, skipped: 'approve', waiting: 1 });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('пауза важнее всего: на паузе не уходит ничего и днём', async () => {
    const { db } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(
      at('12:00'),
      deps(db, { settings: settings({ outreachPaused: true }) }),
    );
    expect(result).toMatchObject({ email: 0, skipped: 'paused' });
    expect(okEmail).not.toHaveBeenCalled();
  });
});

describe('режим «сам по расписанию»: защиты первого автоматического дня (ревью 2026-11-11)', () => {
  const day = new Date('2026-11-11T10:00:00+03:00');
  const auto = (over: Partial<OutreachRunSettings> = {}) =>
    settings({ outreachMode: 'auto', whatsappAuto: false, ...over });

  it('ящик не принимает пароль: проход останавливается до первого письма, фирмы не помечаются', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    const { db, updates, claims } = fakeDb(rows);
    const verifyMail = vi.fn(async () => ({
      ok: false as const,
      reason: 'Invalid login: 535 5.7.8 Error: authentication failed',
    }));
    const mailHint = () => 'host=smtp.yandex.ru login=@yandex.ru from=login pass=other';
    const result = await sendOutreach(day, deps(db, { settings: auto(), verifyMail, mailHint }));
    expect(result).toMatchObject({ email: 0, errors: 0, mail: 'broken' });
    expect(result.mailError).toContain('535');
    // Признаки настроек — без значений: по ним видно, что чинить, не заходя в Vercel.
    expect(result.mailHint).toBe('host=smtp.yandex.ru login=@yandex.ru from=login pass=other');
    expect(verifyMail).toHaveBeenCalledTimes(1);
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(claims).toEqual([]);
    expect(rows.every((r) => r.status === 'READY' && r.emailSentAt === null)).toBe(true);
  });

  it('ящик не настроен вовсе — проверка отвечает «no-smtp», строк не трогаем', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const result = await sendOutreach(
      day,
      deps(db, {
        settings: auto(),
        verifyMail: async () => ({ ok: false as const, reason: 'no-smtp' }),
      }),
    );
    expect(result).toMatchObject({ email: 0, errors: 0, mail: 'no-smtp' });
    expect(updates).toEqual([]);
  });

  it('три отказа сервера подряд — почта в проходе останавливается, остальная пачка не тронута', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => row({ id }));
    const { db } = fakeDb(rows);
    const failing = vi.fn(async (_input: SendEmailInput) => ({
      ok: false as const,
      reason: '554 5.7.1 Message rejected under suspicion of SPAM',
    }));
    const result = await sendOutreach(day, deps(db, { settings: auto(), email: failing }));
    expect(failing).toHaveBeenCalledTimes(MAIL_FAILURES_STOP);
    expect(result).toMatchObject({ email: 0, errors: MAIL_FAILURES_STOP, mail: 'broken' });
    expect(result.mailError).toContain('554');
    // Четвёртая и следующие фирмы остались как были — без отметок и без ошибки.
    for (const untouched of rows.slice(MAIL_FAILURES_STOP)) {
      expect(untouched.emailSentAt).toBeNull();
      expect((untouched as { outreachError?: string | null }).outreachError ?? null).toBeNull();
    }
  });

  it('сервер замолчал на первом письме — одно «не подтверждено», дальше в проходе не пишем', async () => {
    vi.useFakeTimers();
    try {
      const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
      const { db } = fakeDb(rows);
      const hanging = vi.fn((_input: SendEmailInput) => new Promise<never>(() => {}));
      const pass = sendOutreach(
        day,
        deps(db, { settings: auto(), email: hanging, budgetMs: 60_000 }),
      );
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 10);
      const result = await pass;
      expect(hanging).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ email: 0, errors: 1, mail: 'broken' });
      expect(rows[1]!.emailSentAt).toBeNull();
      expect(rows[2]!.emailSentAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('фирме, которая уже ответила, первое письмо не уходит', async () => {
    const rows = [
      row({
        id: 'a',
        status: 'CONTACTED',
        whatsappSentAt: new Date('2026-11-10T10:00:00+03:00'),
        contactedAt: new Date('2026-11-10T10:00:00+03:00'),
        repliedAt: new Date('2026-11-10T15:00:00+03:00'),
      }),
      row({ id: 'b' }),
    ];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(day, deps(db, { settings: auto() }));
    expect(result.email).toBe(1);
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['b@example.com']);
    // И в «письмах дня» её нет.
    const plan = await planOutreach(day, deps(db, { settings: auto() }));
    expect(plan.items.map((i) => i.id)).not.toContain('a');
  });

  it('сам офис пишет только письма: WhatsApp через шлюз без кнопки не уходит', async () => {
    const rows = [row({ id: 'a', whatsapp: '+79271112233' })];
    const fake = fakeDb(rows);
    const result = await sendOutreach(day, deps(fake.db, { settings: auto() }));
    expect(result).toMatchObject({ email: 1, whatsapp: 0 });
    expect(okWhatsApp).not.toHaveBeenCalled();
    expect(rows[0]!.whatsappSentAt).toBeNull();
    // По кнопке владельца — уходит.
    const approved = await sendOutreach(
      day,
      deps(fake.db, { settings: auto(), onlyApproved: fake.approveAll() }),
    );
    expect(approved.whatsapp).toBe(1);
  });

  it('напоминания сам не отправляет, но считает, сколько их ждёт кнопки', async () => {
    const rows = [contacted('r1', 5), contacted('r2', 6), row({ id: 'a' })];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(day, deps(db, { settings: auto() }));
    expect(result).toMatchObject({ email: 1, followUps: 0, followUpsWaiting: 2 });
    expect(okEmail).toHaveBeenCalledTimes(1);
  });

  it('второй проход, пока идёт первый, ничего не отправляет: дневной лимит не удваивается', async () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const { db } = fakeDb(rows);
    let held = false;
    const lock = async () => {
      if (held) return null;
      held = true;
      return async () => {
        held = false;
      };
    };
    let second: OutreachResult | null = null;
    const email = vi.fn(async (_input: SendEmailInput) => {
      // Пока первое письмо первого прохода в пути, приходит второй тик.
      second ??= await sendOutreach(day, deps(db, { settings: auto(), lock }));
      return { ok: true as const };
    });
    const first = await sendOutreach(day, deps(db, { settings: auto(), lock, email }));
    expect(second).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: 'busy', errors: 0 });
    expect(first.email).toBe(2);
    expect(email).toHaveBeenCalledTimes(2);
    // Замок снят: следующий проход работает.
    expect(held).toBe(false);
  });
});

describe('местное время фирмы и «восточное утро» (владелец, 2026-11-12)', () => {
  // 01:00 по Москве = 08:00 во Владивостоке.
  const eastMorning = new Date('2026-11-13T01:00:00+03:00');
  const autoMode = () => settings({ outreachMode: 'auto', whatsappAuto: false, dailyCap: 30 });

  it('ночью по Москве письмо уходит фирме из Владивостока, казанская ждёт своего утра', async () => {
    const rows = [row({ id: 'kzn' }), row({ id: 'vl', city: 'Владивосток', email: 'vl@mail.ru' })];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(eastMorning, deps(db, { settings: autoMode() }));
    expect(result).toMatchObject({ email: 1, skipped: null });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['vl@mail.ru']);
  });

  it('ночью, когда писать некому, — «night»', async () => {
    const { db } = fakeDb([row({ id: 'kzn' })]);
    const result = await sendOutreach(eastMorning, deps(db, { settings: autoMode() }));
    expect(result).toMatchObject({ email: 0, skipped: 'night' });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('днём по Москве у Владивостока уже вечер — ему не пишем', async () => {
    const afternoon = new Date('2026-11-13T15:00:00+03:00'); // 22:00 во Владивостоке
    const rows = [row({ id: 'kzn' }), row({ id: 'vl', city: 'Владивосток', email: 'vl@mail.ru' })];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(afternoon, deps(db, { settings: autoMode() }));
    expect(result.email).toBe(1);
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['kzn@example.com']);
  });

  it('ночная пачка не съедает дневной лимит', async () => {
    const { start } = mskDayBounds(LATER);
    const night = new Date(start.getTime() + 3_600_000);
    const { db } = fakeDb([
      row({ id: 's1', status: 'CONTACTED', emailSentAt: night, contactedAt: night }),
      row({ id: 's2', status: 'CONTACTED', emailSentAt: night, contactedAt: night }),
      row({ id: 'a' }),
    ]);
    const result = await sendOutreach(
      LATER,
      deps(db, { settings: settings({ outreachMode: 'auto', whatsappAuto: false, dailyCap: 2 }) }),
    );
    expect(result.email).toBe(1);
  });
});

describe('два проекта — два лимита, лимит растёт постепенно (владелец, 2026-11-12)', () => {
  it('письма о сайтах и письма площадки считаются раздельно', async () => {
    const day = new Date('2026-11-13T12:00:00+03:00'); // чётный час: сайты первыми
    const rows = [
      row({ id: 's1' }),
      row({ id: 's2', email: 's2@mail.ru' }),
      row({ id: 'p1', kind: 'provider', email: 'p1@mail.ru' }),
      row({ id: 'p2', kind: 'provider', email: 'p2@mail.ru' }),
    ];
    const { db } = fakeDb(rows);
    const result = await sendOutreach(
      day,
      deps(db, { settings: settings({ outreachMode: 'auto', whatsappAuto: false, dailyCap: 1 }) }),
    );
    // По одному письму на проект, а не одно на всех.
    expect(result.email).toBe(2);
    expect(rows.filter((r) => r.emailSentAt).map((r) => r.id)).toEqual(['s1', 'p1']);
  });

  it('rampedCap: с 30 в первый день до заданного лимита примерно за неделю', () => {
    const at = (days: number) => new Date(RAMP_START.getTime() + days * 86_400_000 + 3_600_000);
    expect(rampedCap(300, at(0))).toBe(30);
    expect(rampedCap(300, at(1))).toBe(42);
    expect(rampedCap(300, at(3))).toBe(82);
    expect(rampedCap(300, at(7))).toBe(300);
    expect(rampedCap(300, at(30))).toBe(300);
    // Лимит не больше стартового не трогается; до начала разгона — стартовое значение.
    expect(rampedCap(20, at(5))).toBe(20);
    expect(rampedCap(300, new Date(RAMP_START.getTime() - 86_400_000))).toBe(30);
  });
});
