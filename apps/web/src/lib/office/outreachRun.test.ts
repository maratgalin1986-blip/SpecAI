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

import {
  markReplied,
  OUTREACH_BUDGET_MS,
  sendOutreach,
  type OutreachDb,
  type OutreachRow,
  type OutreachRunSettings,
} from './outreachRun';

const NOW = new Date('2026-11-09T08:00:00+03:00');

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
    ...over,
  };
}

type Update = { id: string; data: Record<string, unknown> };

/** A fake Prospect table: counts by the day, lists by status, records updates. */
function fakeDb(rows: OutreachRow[]) {
  const updates: Update[] = [];
  const inRange = (at: Date | null, range: { gte: Date; lt: Date }) =>
    !!at && at.getTime() >= range.gte.getTime() && at.getTime() < range.lt.getTime();
  const db: OutreachDb = {
    prospect: {
      async count({ where }) {
        return rows.filter((r) =>
          where.emailSentAt
            ? inRange(r.emailSentAt, where.emailSentAt)
            : where.whatsappSentAt
              ? inRange(r.whatsappSentAt, where.whatsappSentAt)
              : true,
        ).length;
      },
      async findMany({ where, take }) {
        return rows
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
          .slice(0, take);
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
    expect(result).toEqual({ email: 0, whatsapp: 0, skipped: 'paused', errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('sends one letter per READY prospect with an address and marks it CONTACTED', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' }), row({ id: 'b', email: null })]);
    const result = await sendOutreach(NOW, deps(db));
    expect(result).toEqual({ email: 1, whatsapp: 0, skipped: null, errors: 0 });
    expect(okEmail).toHaveBeenCalledTimes(1);
    const sent = okEmail.mock.calls[0]![0];
    expect(sent.to).toBe('a@example.com');
    expect(sent.headers).toEqual({ 'Reply-To': 'office@example.com' });
    expect(sent.text).toContain('https://example.test/preview/tok-a');
    expect(sent.text).toContain('15 000 ₽');
    expect(sent.text).toContain('стоматология');
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
    expect(result).toEqual({ email: 0, whatsapp: 1, skipped: null, errors: 0 });
    expect(okEmail).not.toHaveBeenCalled();
    expect(okWhatsApp).toHaveBeenCalledWith(
      '79271112233',
      expect.stringContaining('/preview/tok-a'),
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
      expect(text.length).toBeLessThanOrEqual(600);
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
    expect(result).toEqual({ email: 0, whatsapp: 0, skipped: null, errors: 0 });
    expect(updates).toEqual([]);
  });

  it('records a Russian error text and keeps the status on a failed send', async () => {
    const { db, updates } = fakeDb([row({ id: 'a' }), row({ id: 'b' })]);
    const failing = vi
      .fn<(input: SendEmailInput) => Promise<Awaited<ReturnType<typeof okEmail>>>>()
      .mockResolvedValueOnce({ skipped: false, ok: false, error: 'resend 429' } as never)
      .mockRejectedValueOnce(new Error('сеть недоступна'));
    const result = await sendOutreach(NOW, deps(db, { email: failing }));
    expect(result).toEqual({ email: 0, whatsapp: 0, skipped: null, errors: 2 });
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
