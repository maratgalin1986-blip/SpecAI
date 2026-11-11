import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn(async () => true) }));

import {
  STEP_MIN_MS,
  TICK_LOCK_MS,
  TICK_RESERVE_MS,
  officeTick,
  purgeTerminatedSiteLeads,
  sendDigestChunks,
  tickLockKey,
  type LeadPurgeDb,
  type TickDeps,
} from './tick';
import { OFERTA_LEADS_DELETE_DAYS } from './oferta';
import type { ScheduledStepResult } from './run';

const okStep = (city: string): ScheduledStepResult => ({
  skipped: null,
  step: { agent: 'providers', niche: 'machinery', city },
  result: { runId: 'r1', found: 5, created: 3, skipped: 2, error: null },
});

const MORNING = new Date('2026-11-09T06:30:00Z'); // 09:30 по Москве
const NIGHT = new Date('2026-11-09T00:30:00Z'); // 03:30 по Москве — до утреннего окна

function deps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    lock: vi.fn(async () => true),
    purgeLeads: vi.fn(async () => 0),
    step: vi.fn(async () => okStep('Казань')),
    outreach: vi.fn(async () => ({ email: 1, whatsapp: 0, skipped: null, errors: 0 })),
    sendDigest: vi.fn(async () => true),
    ...over,
  };
}

describe('officeTick', () => {
  it('делает несколько шагов, пока хватает времени, потом рассылку и сводку', async () => {
    const d = deps();
    const result = await officeTick(
      MORNING,
      { budgetMs: 60_000, maxSteps: 3, digest: 'window' },
      d,
    );
    expect(d.step).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ outreach: { email: 1 }, digest: true });
    if ('skipped' in result) throw new Error('busy');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toMatchObject({ city: 'Казань', found: 5, created: 3 });
  });

  it('второй шаг не начинается, когда до резерва осталось меньше STEP_MIN_MS', async () => {
    let now = 0;
    const step = vi.fn(async () => {
      now += 20_000;
      return okStep('Челны');
    });
    const d = deps({ step, clock: () => now });
    const budgetMs = 20_000 + TICK_RESERVE_MS + STEP_MIN_MS - 1; // ровно на один шаг
    const result = await officeTick(MORNING, { budgetMs, maxSteps: 3, digest: 'window' }, d);
    expect(step).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outreach: { email: 1 } });
  });

  it('на паузе или при ошибке источника дальше не идёт', async () => {
    const paused = deps({
      step: vi.fn(async () => ({ skipped: 'paused' as const, step: null, result: null })),
    });
    const r1 = await officeTick(
      MORNING,
      { budgetMs: 60_000, maxSteps: 3, digest: 'window' },
      paused,
    );
    expect(paused.step).toHaveBeenCalledTimes(1);
    expect(r1).toMatchObject({ steps: [{ skipped: 'paused' }] });

    const failing = deps({
      step: vi.fn(async (): Promise<ScheduledStepResult> => ({
        skipped: null,
        step: { agent: 'providers', niche: 'machinery', city: 'Уфа' },
        result: {
          runId: 'r2',
          found: 0,
          created: 0,
          skipped: 0,
          error: 'Источник карт не ответил',
        },
      })),
    });
    await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 3, digest: 'window' }, failing);
    expect(failing.step).toHaveBeenCalledTimes(1);
  });

  it('сводка в режиме window — только с 08:00 по Москве; в режиме any — когда угодно', async () => {
    const d1 = deps();
    await officeTick(NIGHT, { budgetMs: 60_000, maxSteps: 1, digest: 'window' }, d1);
    expect(d1.sendDigest).not.toHaveBeenCalled();
    const d2 = deps();
    const r = await officeTick(NIGHT, { budgetMs: 60_000, maxSteps: 1, digest: 'any' }, d2);
    expect(d2.sendDigest).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ digest: true });
  });

  it('упавший шаг не роняет тик: ошибка записана, рассылка идёт', async () => {
    const d = deps({
      step: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    const silent = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 2, digest: 'window' }, d);
    silent.mockRestore();
    expect(r).toMatchObject({ steps: [{ skipped: 'error' }], outreach: { email: 1 } });
  });

  it('в ответе нет имён, телефонов и токенов', async () => {
    const r = await officeTick(
      MORNING,
      { budgetMs: 60_000, maxSteps: 1, digest: 'window' },
      deps(),
    );
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/\+7|token|phone|name/i);
  });

  it('занято: второй тик в том же десятиминутном окне ничего не делает', async () => {
    const d = deps({ lock: vi.fn(async () => false) });
    const r = await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 3, digest: 'window' }, d);
    expect(r).toEqual({ skipped: 'busy' });
    expect(d.step).not.toHaveBeenCalled();
    expect(d.outreach).not.toHaveBeenCalled();
    // Ключ — десятиминутное окно по часам: 08:10:30 и 08:19:30 — одно окно, 08:20:30 — следующее.
    const a = new Date('2026-11-09T08:10:30Z');
    expect(tickLockKey(a)).toBe(tickLockKey(new Date(a.getTime() + 9 * 60_000)));
    expect(tickLockKey(a)).not.toBe(tickLockKey(new Date(a.getTime() + TICK_LOCK_MS)));
  });

  it('шагу передаётся его бюджет: остаток сверх резерва, не больше возможностей источника', async () => {
    const step = vi.fn(async () => okStep('Елабуга'));
    await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 1, digest: 'window' }, deps({ step }));
    const budget = (step.mock.calls[0] as unknown as [Date, number])[1];
    expect(budget).toBeLessThanOrEqual(60_000 - TICK_RESERVE_MS);
    expect(budget).toBeGreaterThanOrEqual(STEP_MIN_MS);
  });
});

describe('officeTick — письма дня (К2)', () => {
  it('сколько писем ждут владельца — передаётся в сводку', async () => {
    const d = deps({
      outreach: vi.fn(async () => ({
        email: 0,
        whatsapp: 0,
        skipped: 'approve',
        errors: 0,
        waiting: 5,
      })),
    });
    const result = await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 0, digest: 'any' }, d);
    expect(result).toMatchObject({ outreach: { skipped: 'approve', waiting: 5 }, digest: true });
    expect(d.sendDigest).toHaveBeenCalledWith(MORNING, { outboxWaiting: 5 });
  });

  it('без писем дня сводка получает пустое дополнение', async () => {
    const d = deps();
    await officeTick(MORNING, { budgetMs: 60_000, maxSteps: 0, digest: 'any' }, d);
    expect(d.sendDigest).toHaveBeenCalledWith(MORNING, {});
  });

  it('удаляет заявки с клиентских сайтов старше срока хранения — и не роняет тик при ошибке', async () => {
    const purgeLeads = vi.fn(async () => {
      throw new Error('db down');
    });
    const silent = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await officeTick(
      MORNING,
      { budgetMs: 60_000, maxSteps: 1, digest: 'window' },
      deps({ purgeLeads }),
    );
    silent.mockRestore();
    expect(purgeLeads).toHaveBeenCalledWith(MORNING);
    expect(r).toMatchObject({ digest: true });
  });
});

describe('sendDigestChunks: длинная сводка уходит частями', () => {
  const long = Array.from({ length: 90 }, () => 'я'.repeat(99)).join('\n');

  it('все части приняты — true, порядок сохранён', async () => {
    const sent: string[] = [];
    const ok = await sendDigestChunks(long, async (chunk) => {
      sent.push(chunk);
      return true;
    });
    expect(ok).toBe(true);
    expect(sent).toHaveLength(3);
    expect(sent.every((c) => c.length <= 4000)).toBe(true);
    expect(sent.join('\n')).toBe(long);
  });

  it('одна часть не принята — false (onceADay повторит на следующем тике)', async () => {
    const send = vi
      .fn(async () => true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(await sendDigestChunks(long, send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('пустой текст — нечего слать, false', async () => {
    const send = vi.fn(async () => true);
    expect(await sendDigestChunks('', send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('purgeTerminatedSiteLeads — заявки посетителей после прекращения договора (оферта, п. 7.2)', () => {
  const NOW = new Date('2026-11-11T09:00:00Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  function fakeDb(
    prospects: { id: string; status: string; declinedAt: Date | null }[],
    leads: { prospectId: string }[],
  ) {
    const db: LeadPurgeDb = {
      siteLead: {
        async findMany() {
          return [...new Set(leads.map((l) => l.prospectId))].map((prospectId) => ({ prospectId }));
        },
        async deleteMany({ where }) {
          const before = leads.length;
          const keep = leads.filter((l) => !where.prospectId.in.includes(l.prospectId));
          leads.splice(0, leads.length, ...keep);
          return { count: before - leads.length };
        },
      },
      prospect: {
        async findMany({ where }) {
          return prospects
            .filter(
              (p) =>
                where.id.in.includes(p.id) &&
                p.status === where.status &&
                !!p.declinedAt &&
                p.declinedAt.getTime() < where.declinedAt.lt.getTime(),
            )
            .map((p) => ({ id: p.id }));
        },
      },
    };
    return db;
  }

  it('удаляет заявки сайта, снятого больше OFERTA_LEADS_DELETE_DAYS назад; остальные не трогает', async () => {
    expect(OFERTA_LEADS_DELETE_DAYS).toBe(30);
    const leads = [
      { prospectId: 'gone' },
      { prospectId: 'gone' },
      { prospectId: 'recent' },
      { prospectId: 'active' },
      { prospectId: 'returned' },
    ];
    const db = fakeDb(
      [
        { id: 'gone', status: 'DECLINED', declinedAt: daysAgo(31) },
        // Снят недавно — срок ещё не вышел.
        { id: 'recent', status: 'DECLINED', declinedAt: daysAgo(29) },
        { id: 'active', status: 'PUBLISHED', declinedAt: null },
        // Отказывался давно, но вернулся: договор действует, заявки остаются.
        { id: 'returned', status: 'AGREED', declinedAt: daysAgo(90) },
      ],
      leads,
    );
    expect(await purgeTerminatedSiteLeads(NOW, db)).toBe(2);
    expect(leads.map((l) => l.prospectId)).toEqual(['recent', 'active', 'returned']);
    // Повторный проход ничего не находит.
    expect(await purgeTerminatedSiteLeads(NOW, db)).toBe(0);
  });

  it('заявок нет — к кандидатам не обращается', async () => {
    const db = fakeDb([{ id: 'gone', status: 'DECLINED', declinedAt: daysAgo(99) }], []);
    const spy = vi.spyOn(db.prospect, 'findMany');
    expect(await purgeTerminatedSiteLeads(NOW, db)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
