import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mskDayBounds } from '@/lib/adminCrm';
import type { SendEmailInput } from '@/lib/email';

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

import { STOP_LINE, WHATSAPP_MAX_LENGTH } from './outreach';
import type { SentOffer } from './aiOffer';
import type { Dossier } from './dossier';
import { buildOffer } from './offer';
import {
  FOLLOW_UP_AFTER_DAYS,
  FOLLOW_UP_MAX_DAYS,
  followUpWindow,
  markReplied,
  OUTREACH_BUDGET_MS,
  outreachErrorText,
  sendOutreach,
  type OutreachDb,
  type OutreachRow,
  type OutreachRunSettings,
} from './outreachRun';

const NOW = new Date('2026-11-09T08:00:00+03:00');
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
  offerAngle?: string | null;
  previewViews?: number;
  agreedAt?: Date | null;
};

/**
 * A fake Prospect table: counts by the day, lists by the filters the runner uses, records
 * updates. Every write in a test happens «today», so the «failed today» filter (NOT) is
 * simply «has an outreachError».
 */
function fakeDb(rows: Row[]) {
  const updates: Update[] = [];
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
          .filter((r) =>
            where.OR
              ? where.OR.some(
                  (c) =>
                    (c.whatsapp && r.whatsapp?.endsWith(c.whatsapp.endsWith)) ||
                    (c.phone && r.phone.endsWith(c.phone.endsWith)),
                )
              : true,
          )
          .filter((r) => !where.NOT || !r.outreachError)
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
        const target = rows.find((r) => r.id === where.id && where.status.in.includes(r.status));
        if (!target) return { count: 0 };
        updates.push({ id: where.id, data });
        Object.assign(target, data);
        return { count: 1 };
      },
    },
  };
  return { db, updates };
}

function settings(over: Partial<OutreachRunSettings> = {}): () => Promise<OutreachRunSettings> {
  return async () => ({
    outreachPaused: false,
    dailyCap: 20,
    replyTo: 'office@example.com',
    whatsappToPhone: false,
    ...over,
  });
}

const okEmail = vi.fn(async (_input: SendEmailInput) => ({
  skipped: false as const,
  ok: true as const,
  id: 'm1',
}));
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
    expect(result).toEqual({ email: 1, whatsapp: 0, followUps: 0, skipped: null, errors: 0 });
    expect(okEmail).toHaveBeenCalledTimes(1);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.to).toBe('a@example.com');
    expect(sent.headers).toEqual({ 'Reply-To': 'office@example.com' });
    expect(sent.text).toContain('https://example.test/preview/tok-a');
    // «Кто мы и цены» leads to the service page, labelled with the channel and the slug (S12).
    expect(sent.text).toContain(
      'Кто мы и цены: https://example.test/sajt-pod-klyuch?utm_source=email&utm_campaign=slug-a',
    );
    expect(sent.text).toContain('Заявки с сайта будут приходить вам на почту');
    expect(sent.text).toContain('15 000 ₽');
    // No dossier: the personal offer with a general angle (U2).
    expect(sent.text).toContain('Что даст страница именно вам:');
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
    const earlierToday = new Date(start.getTime() + 3_600_000);
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
    const result = await sendOutreach(NOW, deps(db, { settings: settings({ dailyCap: 3 }) }));
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
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: null, errors: 0 });
    expect(updates).toEqual([]);
  });

  it('records a Russian error text and keeps the status on a failed send', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' }), row({ id: 'b' })]);
    const failing = vi
      .fn<(input: SendEmailInput) => Promise<Awaited<ReturnType<typeof okEmail>>>>()
      .mockResolvedValueOnce({ skipped: false, ok: false, error: 'resend 429' } as never)
      .mockRejectedValueOnce(new Error('сеть недоступна'));
    const result = await sendOutreach(NOW, deps(db, { email: failing }));
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 0, skipped: null, errors: 2 });
    expect(updates).toHaveLength(2);
    expect(updates[0]!.data).toEqual({ outreachError: 'Письмо не отправлено: resend 429' });
    expect(updates[1]!.data).toEqual({ outreachError: 'Письмо не отправлено: сеть недоступна' });
    expect(String(updates[0]!.data.outreachError).length).toBeLessThanOrEqual(300);
  });

  it('a skipped send (channel not configured at send time) is an error, not a contact', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' })]);
    const skipping = vi.fn(async (_input: SendEmailInput) => ({
      skipped: true as const,
      reason: 'RESEND_API_KEY is not set',
    }));
    const result = await sendOutreach(NOW, deps(db, { email: skipping }));
    expect(result.errors).toBe(1);
    expect(updates[0]!.data).toEqual({
      outreachError: 'Письмо не отправлено: RESEND_API_KEY is not set',
    });
  });

  it('stops when the time budget is spent', async () => {
    const { db } = fakeDb([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    let tick = 0;
    const clock = () => {
      tick += 1;
      // The first reading is the start; every later reading is past the budget after one send.
      return tick <= 2 ? 0 : OUTREACH_BUDGET_MS + 1;
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
      return { ok: true as const, skipped: false as const };
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
      where: { NOT: { outreachError: { not: null }, updatedAt: { gte: mskDayBounds(NOW).start } } },
      orderBy: [{ outreachError: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
  });
});

describe('sendOutreach — reminders (S8)', () => {
  it('followUpWindow: the first letter went 4 to 14 days ago', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(4);
    expect(followUpWindow(NOW)).toEqual({
      gte: daysAgo(FOLLOW_UP_MAX_DAYS),
      lte: daysAgo(FOLLOW_UP_AFTER_DAYS),
    });
  });

  it('sends one short reminder to a prospect who did not answer in 4 days, and marks it', async () => {
    const rows = [contacted('a', 5)];
    const { db, updates } = fakeDb(rows);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toEqual({ email: 0, whatsapp: 0, followUps: 1, skipped: null, errors: 0 });
    expect(okEmail).toHaveBeenCalledTimes(1);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.to).toBe('a@example.com');
    expect(sent.subject).toBe('Напоминаем: страница для «Компания a» готова');
    expect(sent.headers).toEqual({ 'Reply-To': 'office@example.com' });
    expect(sent.text).toContain('Посмотрите — это 30 секунд.');
    expect(sent.text).toContain('https://example.test/preview/tok-a');
    expect(sent.text).toContain(
      'https://example.test/sajt-pod-klyuch?utm_source=email&utm_campaign=slug-a',
    );
    const lines = sent.text!.trim().split('\n').filter(Boolean);
    expect(lines[lines.length - 2]).toContain(STOP_LINE);
    expect(okWhatsApp).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data).toEqual({
      followUpSentAt: expect.any(Date),
      outreachError: null,
    });
    // Only the reminder mark: the first letter's date and the status stay as they were.
    expect(rows[0]!.emailSentAt).toEqual(daysAgo(5));
    expect(rows[0]!.status).toBe('CONTACTED');

    // Once: the next pass does not write again.
    okEmail.mockClear();
    const again = await sendOutreach(NOW, deps(db));
    expect(again.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('skips too early, too old, answered, already reminded, without e-mail and other statuses', async () => {
    const { db, updates } = fakeDb([
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
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toMatchObject({ email: 0, followUps: 0, errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('a declined, agreed or published prospect with an old letter gets no reminder', async () => {
    const { db } = fakeDb(
      ['CALLBACK', 'AGREED', 'PUBLISHED', 'DECLINED', 'REGISTERED'].map((status) =>
        contacted(status, 6, { status }),
      ),
    );
    const result = await sendOutreach(NOW, deps(db));
    expect(result.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('asks the database for exactly the due reminders, oldest letter first', async () => {
    const seen: Parameters<OutreachDb['prospect']['findMany']>[0][] = [];
    const { db } = fakeDb([contacted('a', 5)]);
    const findMany = db.prospect.findMany.bind(db.prospect);
    db.prospect.findMany = async (args) => {
      seen.push(args);
      return findMany(args);
    };
    await sendOutreach(NOW, deps(db));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({
      where: {
        status: { in: ['CONTACTED'] },
        emailSentAt: followUpWindow(NOW),
        email: { not: null },
        followUpSentAt: null,
        repliedAt: null,
        NOT: { outreachError: { not: null }, updatedAt: { gte: mskDayBounds(NOW).start } },
      },
      orderBy: { emailSentAt: 'asc' },
      take: 50,
    });
  });

  it('first letters go first; reminders share the daily e-mail cap and count towards it', async () => {
    const { db } = fakeDb([row({ id: 'new' }), contacted('r1', 6), contacted('r2', 5)]);
    const result = await sendOutreach(NOW, deps(db, { settings: settings({ dailyCap: 2 }) }));
    expect(result).toMatchObject({ email: 1, followUps: 1 });
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['new@example.com', 'r1@example.com']);
  });

  it('reminders sent earlier today use up the cap for first letters too', async () => {
    const { start } = mskDayBounds(NOW);
    const earlierToday = new Date(start.getTime() + 3_600_000);
    const { db } = fakeDb([
      contacted('done1', 6, { followUpSentAt: earlierToday }),
      contacted('done2', 7, { followUpSentAt: earlierToday }),
      row({ id: 'new' }),
      contacted('due', 5),
    ]);
    const result = await sendOutreach(NOW, deps(db, { settings: settings({ dailyCap: 2 }) }));
    expect(result).toMatchObject({ email: 0, followUps: 0 });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('no WhatsApp reminders: a prospect written to only in WhatsApp gets nothing more', async () => {
    const { db } = fakeDb([
      contacted('wa', 6, {
        email: null,
        emailSentAt: null,
        whatsapp: '+79271112233',
        whatsappSentAt: daysAgo(6),
      }),
      contacted('both', 6, { whatsapp: '+79271112244', whatsappSentAt: daysAgo(6) }),
    ]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toMatchObject({ whatsapp: 0, followUps: 1 });
    expect(okWhatsApp).not.toHaveBeenCalled();
    expect(okEmail.mock.calls.map((c) => c[0].to)).toEqual(['both@example.com']);
  });

  it('no reminders while e-mail is not configured on the server', async () => {
    const { db } = fakeDb([contacted('a', 5)]);
    const result = await sendOutreach(
      NOW,
      deps(db, { channels: () => ({ email: false, whatsapp: true }) }),
    );
    expect(result.followUps).toBe(0);
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('nothing while the outreach is paused', async () => {
    const { db } = fakeDb([contacted('a', 5)]);
    const result = await sendOutreach(
      NOW,
      deps(db, { settings: settings({ outreachPaused: true }) }),
    );
    expect(result).toMatchObject({ followUps: 0, skipped: 'paused' });
    expect(okEmail).not.toHaveBeenCalled();
  });

  it('a failed reminder is an error with a Russian text, retried not before tomorrow', async () => {
    const rows: Row[] = [contacted('a', 5)];
    const { db, updates } = fakeDb(rows);
    const failing = vi.fn(async (_input: SendEmailInput) => ({
      skipped: false as const,
      ok: false as const,
      error: 'resend 429',
    }));
    const result = await sendOutreach(NOW, deps(db, { email: failing }));
    expect(result).toMatchObject({ followUps: 0, errors: 1 });
    expect(updates).toEqual([
      { id: 'a', data: { outreachError: 'Напоминание не отправлено: resend 429' } },
    ]);
    expect(rows[0]!.followUpSentAt).toBeNull();
    // Same day: the failed row is not picked again.
    const again = await sendOutreach(NOW, deps(db, { email: failing }));
    expect(again.errors).toBe(0);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('a send that times out or throws is an error, not a reminder', async () => {
    const { db, updates } = fakeDb([contacted('a', 5)]);
    const throwing = vi.fn(async (_input: SendEmailInput): Promise<never> => {
      throw new Error('сеть недоступна');
    });
    const result = await sendOutreach(NOW, deps(db, { email: throwing }));
    expect(result).toMatchObject({ followUps: 0, errors: 1 });
    expect(updates[0]!.data).toEqual({
      outreachError: outreachErrorText('followUp', 'сеть недоступна'),
    });
  });

  it('the mark is written only while the prospect is still CONTACTED', async () => {
    const rows = [contacted('a', 5)];
    const { db, updates } = fakeDb(rows);
    const email = vi.fn(async (_input: SendEmailInput) => {
      // The owner presses «Согласился» while the reminder is in flight.
      rows[0]!.status = 'AGREED';
      return { ok: true as const, skipped: false as const, id: null };
    });
    const result = await sendOutreach(NOW, deps(db, { email }));
    expect(result.followUps).toBe(1);
    expect(rows[0]!.status).toBe('AGREED');
    expect(rows[0]!.followUpSentAt).toBeNull();
    expect(updates).toEqual([]);
  });

  it('stays within the time budget: no reminder pass when the first pass used it up', async () => {
    const { db } = fakeDb([row({ id: 'a' }), contacted('r', 5)]);
    let now = 0;
    // Every send takes the whole budget.
    const slowEmail = vi.fn(async (_input: SendEmailInput) => {
      now += OUTREACH_BUDGET_MS + 1;
      return { skipped: false as const, ok: true as const, id: null };
    });
    const result = await sendOutreach(NOW, deps(db, { clock: () => now, email: slowEmail }));
    expect(result).toMatchObject({ email: 1, followUps: 0 });
    expect(slowEmail.mock.calls.map((c) => c[0].to)).toEqual(['a@example.com']);
  });

  it('stops between reminders when the time budget runs out', async () => {
    const { db } = fakeDb([contacted('r1', 6), contacted('r2', 5)]);
    let now = 0;
    const slowEmail = vi.fn(async (_input: SendEmailInput) => {
      now += OUTREACH_BUDGET_MS + 1;
      return { skipped: false as const, ok: true as const, id: null };
    });
    const result = await sendOutreach(NOW, deps(db, { clock: () => now, email: slowEmail }));
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
    // Three or more neighbours with a site: the own-domain package with its price.
    expect(letter.text).toContain('«Сайт на своём домене» — 17\u00a0000\u00a0₽ один раз');
    expect(letter.text).toContain('https://example.test/preview/tok-a');
    expect(letter.text).toContain('Кто мы и цены: ');
    const lines = letter.text!.trim().split('\n').filter(Boolean);
    expect(lines[lines.length - 2]).toContain(STOP_LINE);
    const wa = okWhatsApp.mock.calls[0]![1];
    expect(wa).toContain(expected.opener);
    expect(wa).toContain('https://example.test/preview/tok-a');
    expect(wa).toContain('17\u00a0000\u00a0₽');
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
      ...buildOffer({ dossier, angle: 'weekends', companyName: 'Компания a' }),
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
    const failing = vi.fn(async () => ({
      skipped: false as const,
      ok: false as const,
      error: 'x',
    }));
    await sendOutreach(NOW, deps(db, { email: failing, improve: noAi }));
    expect(updates[0]!.data).not.toHaveProperty('offerAngle');
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
    expect(updates[0]!.data).toEqual({ repliedAt: NOW, status: 'DECLINED', declinedAt: NOW });
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
