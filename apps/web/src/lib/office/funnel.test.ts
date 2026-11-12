import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import {
  FUNNEL_AGENTS,
  FUNNEL_STAGES,
  SITE_LEADS_DAYS,
  STOCK_LOW_DAYS,
  agentFunnel,
  collectFunnel,
  funnelNotes,
  funnelRows,
  funnelShare,
  parseDailyCap,
  stockDays,
  stockNotes,
  stockWhere,
  workingDays,
  type AgentFunnel,
  type FunnelData,
  type FunnelDb,
  type StageCounts,
} from './funnel';
import { OFFICE_SETTINGS } from './plan';

const NOW = new Date('2026-11-09T09:00:00Z');
const DAY = 86_400_000;

function stage(over: Partial<StageCounts> = {}): StageCounts {
  return {
    _all: 0,
    contactedAt: 0,
    repliedAt: 0,
    agreedAt: 0,
    setupPaidAt: 0,
    registeredAt: 0,
    ...over,
  };
}

function sites(over: Partial<AgentFunnel> = {}): AgentFunnel {
  return {
    agent: 'sites',
    found: 120,
    contacted: 40,
    replied: 10,
    agreed: 4,
    paid: 3,
    active: 2,
    registered: 0,
    fromContacted: { replied: 10, agreed: 3, paid: 2, active: 2, registered: 0 },
    ...over,
  };
}

function providers(over: Partial<AgentFunnel> = {}): AgentFunnel {
  return {
    agent: 'providers',
    found: 80,
    contacted: 0,
    replied: 0,
    agreed: 1,
    paid: 0,
    active: 0,
    registered: 1,
    fromContacted: { replied: 0, agreed: 0, paid: 0, active: 0, registered: 0 },
    ...over,
  };
}

describe('funnelShare', () => {
  it('целые проценты от «написали»', () => {
    expect(funnelShare(10, 40)).toBe('25%');
    expect(funnelShare(1, 3)).toBe('33%');
    expect(funnelShare(2, 3)).toBe('67%');
    expect(funnelShare(0, 40)).toBe('0%');
    expect(funnelShare(40, 40)).toBe('100%');
  });

  it('неполная доля не превращается в 0% или 100%', () => {
    expect(funnelShare(1, 300)).toBe('1%');
    expect(funnelShare(299, 300)).toBe('99%');
  });

  it('некому было писать — доли нет; лишнее и мусор не ломают процент', () => {
    expect(funnelShare(0, 0)).toBeNull();
    expect(funnelShare(5, 0)).toBeNull();
    expect(funnelShare(5, Number.NaN)).toBeNull();
    expect(funnelShare(12, 10)).toBe('100%');
    expect(funnelShare(-3, 10)).toBe('0%');
    expect(funnelShare(Number.NaN, 10)).toBe('0%');
  });
});

describe('funnelRows', () => {
  const rows = funnelRows({ agents: [providers(), sites()] });
  const row = (key: string) => rows.find((r) => r.stage === key)!;

  it('этапы по порядку воронки, столбцы — оба агента', () => {
    expect(rows.map((r) => r.stage)).toEqual([
      'found',
      'contacted',
      'replied',
      'agreed',
      'paid',
      'active',
      'registered',
    ]);
    expect(FUNNEL_AGENTS).toEqual(['sites', 'providers']);
    for (const r of rows) {
      expect(Object.keys(r.cells).sort()).toEqual(['providers', 'sites']);
      expect(r.title).toMatch(/^[А-ЯЁ]/);
      expect(r.hint.length).toBeGreaterThan(0);
    }
  });

  it('«найдено» и «написали» — без доли, дальше — доля от тех, кому написали', () => {
    expect(row('found').cells.sites).toEqual({ count: 120, share: null });
    expect(row('contacted').cells.sites).toEqual({ count: 40, share: null });
    expect(row('replied').cells.sites).toEqual({ count: 10, share: '25%' });
    // Согласились всего 4, из написанных — 3: доля честная, число — полное.
    expect(row('agreed').cells.sites).toEqual({ count: 4, share: '8%' });
    expect(row('paid').cells.sites).toEqual({ count: 3, share: '5%' });
    expect(row('active').cells.sites).toEqual({ count: 2, share: '5%' });
  });

  it('оплата — только у «Сайтов», регистрация — только у «Подрядчиков»', () => {
    expect(row('paid').cells.providers).toBeNull();
    expect(row('active').cells.providers).toBeNull();
    expect(row('registered').cells.sites).toBeNull();
    expect(row('registered').cells.providers).toEqual({ count: 1, share: null });
    // Подрядчикам ещё не писали: доли нет, числа есть.
    expect(row('agreed').cells.providers).toEqual({ count: 1, share: null });
  });

  it('агента нет в данных — прочерки, а не нули', () => {
    const only = funnelRows({ agents: [sites()] });
    for (const r of only) expect(r.cells.providers).toBeNull();
  });

  it('у каждого этапа есть хотя бы один агент', () => {
    for (const info of FUNNEL_STAGES) expect(info.agents.length).toBeGreaterThan(0);
  });
});

describe('funnelNotes', () => {
  const data = (over: Partial<FunnelData> = {}): FunnelData => ({
    agents: [],
    stock: [],
    dailyCap: 20,
    revenue: 4500,
    siteLeads: 7,
    siteLeadsUndelivered: 0,
    ...over,
  });

  it('выручка в рублях с неразрывными пробелами и заявки за 30 дней', () => {
    expect(funnelNotes(data())).toEqual([
      'Выручка в месяц: 4 500 ₽',
      `Заявок с клиентских сайтов за ${SITE_LEADS_DAYS} дней: 7`,
    ]);
  });

  it('недоставленные заявки видны', () => {
    expect(funnelNotes(data({ siteLeadsUndelivered: 2 }))[1]).toBe(
      'Заявок с клиентских сайтов за 30 дней: 7 (не доставлено клиентам: 2)',
    );
    expect(funnelNotes(data({ revenue: 0, siteLeads: 0 }))).toEqual([
      'Выручка в месяц: 0 ₽',
      'Заявок с клиентских сайтов за 30 дней: 0',
    ]);
  });
});

describe('запас кандидатов (К15)', () => {
  it('рабочие дни склоняются', () => {
    expect(workingDays(1)).toBe('1 рабочий день');
    expect(workingDays(3)).toBe('3 рабочих дня');
    expect(workingDays(0)).toBe('0 рабочих дней');
    expect(workingDays(11)).toBe('11 рабочих дней');
    expect(workingDays(12)).toBe('12 рабочих дней');
    expect(workingDays(21)).toBe('21 рабочий день');
    expect(workingDays(24)).toBe('24 рабочих дня');
  });

  it('дни — запас, делённый на лимит, вниз; лимит 0 — дней нет', () => {
    expect(stockDays(250, 20)).toBe(12);
    expect(stockDays(19, 20)).toBe(0);
    expect(stockDays(0, 20)).toBe(0);
    expect(stockDays(100, 0)).toBeNull();
    expect(stockDays(100, Number.NaN)).toBeNull();
    expect(stockDays(-5, 20)).toBe(0);
  });

  it('строки по агентам в порядке столбцов, с лимитом и отметкой «мало»', () => {
    const notes = stockNotes({
      stock: [
        { agent: 'providers', withEmail: 45 },
        { agent: 'sites', withEmail: 250 },
      ],
      dailyCap: 20,
    });
    expect(notes).toEqual([
      {
        agent: 'sites',
        text: 'Сайты под ключ: запас кандидатов с почтой — 250 (≈ 12 рабочих дней при лимите 20 в день)',
        low: false,
      },
      {
        agent: 'providers',
        text:
          'Подрядчики: запас кандидатов с почтой — 45 (≈ 2 рабочих дня при лимите 20 в день)' +
          ' — пора добавить ниши или города',
        low: true,
      },
    ]);
    expect(STOCK_LOW_DAYS).toBe(10);
    // Ровно 10 дней — уже не мало.
    expect(stockNotes({ stock: [{ agent: 'sites', withEmail: 200 }], dailyCap: 20 })[0]!.low).toBe(
      false,
    );
  });

  it('лимит 0 — рассылка не идёт, дней не считаем', () => {
    expect(stockNotes({ stock: [{ agent: 'sites', withEmail: 30 }], dailyCap: 0 })).toEqual([
      {
        agent: 'sites',
        text: 'Сайты под ключ: запас кандидатов с почтой — 30 (лимит писем в день — 0, рассылка не идёт)',
        low: false,
      },
    ]);
  });

  it('запас — ждущие кандидаты с почтой, без письма и отписки', () => {
    expect(stockWhere('site')).toEqual({
      kind: 'site',
      status: 'READY',
      email: { not: null },
      NOT: { email: '' },
      emailSentAt: null,
      optOutAt: null,
    });
  });

  it('лимит из настройки, пусто или мусор — по умолчанию', () => {
    expect(parseDailyCap('35')).toBe(35);
    expect(parseDailyCap(' 0 ')).toBe(0);
    expect(parseDailyCap(undefined)).toBe(250);
    expect(parseDailyCap('много')).toBe(250);
    expect(parseDailyCap('-3')).toBe(250);
  });
});

describe('agentFunnel', () => {
  it('раскладывает три счётчика по этапам', () => {
    const f = agentFunnel(
      'sites',
      stage({ _all: 50, contactedAt: 20, repliedAt: 6, agreedAt: 4, setupPaidAt: 3 }),
      stage({ _all: 20, repliedAt: 5, agreedAt: 2, setupPaidAt: 1 }),
      stage({ _all: 2, contactedAt: 1 }),
    );
    expect(f).toEqual({
      agent: 'sites',
      found: 50,
      contacted: 20,
      replied: 6,
      agreed: 4,
      paid: 3,
      active: 2,
      registered: 0,
      fromContacted: { replied: 5, agreed: 2, paid: 1, active: 1, registered: 0 },
    });
  });
});

describe('collectFunnel', () => {
  function fakeDb() {
    const countCalls: Record<string, unknown>[] = [];
    const leadCalls: Record<string, unknown>[] = [];
    const findManyCalls: unknown[] = [];
    const db: FunnelDb = {
      prospect: {
        count: vi.fn(async ({ where }) => {
          countCalls.push(where);
          const site = where.kind === 'site';
          if ('emailSentAt' in where) {
            return site ? stage({ _all: 250 }) : stage({ _all: 45 });
          }
          if ('contactedAt' in where) {
            return site
              ? stage({ _all: 20, repliedAt: 5, agreedAt: 2, setupPaidAt: 1 })
              : stage({ _all: 9, repliedAt: 3, agreedAt: 1, registeredAt: 1 });
          }
          if ('paidUntil' in where) {
            return site ? stage({ _all: 3, contactedAt: 2 }) : stage();
          }
          return site
            ? stage({ _all: 50, contactedAt: 20, repliedAt: 6, agreedAt: 4, setupPaidAt: 3 })
            : stage({ _all: 30, contactedAt: 9, repliedAt: 3, agreedAt: 2, registeredAt: 2 });
        }),
        findMany: vi.fn(async (args) => {
          findManyCalls.push(args);
          return [
            // Своя цена клиента.
            {
              setupPrice: null,
              monthlyPrice: 2000,
              setupPaidAt: NOW,
              paidUntil: new Date(NOW.getTime() + 20 * DAY),
            },
            // Базовая цена из настроек офиса; истекает — но ещё оплачен.
            {
              setupPrice: null,
              monthlyPrice: null,
              setupPaidAt: NOW,
              paidUntil: new Date(NOW.getTime() + 3 * DAY),
            },
            // Строка с прошедшей оплатой в выручку не входит, даже если база её вернула.
            {
              setupPrice: null,
              monthlyPrice: 9000,
              setupPaidAt: NOW,
              paidUntil: new Date(NOW.getTime() - DAY),
            },
          ];
        }),
      },
      siteLead: {
        count: vi.fn(async ({ where }) => {
          leadCalls.push(where);
          return 'forwardedAt' in where ? 1 : 6;
        }),
      },
      appSetting: {
        findMany: vi.fn(async () => [
          { key: OFFICE_SETTINGS.siteMonthly, value: '1800' },
          { key: OFFICE_SETTINGS.dailyCap, value: '25' },
        ]),
      },
    };
    return { db, countCalls, leadCalls, findManyCalls };
  }

  it('собирает воронку обоих агентов, выручку и заявки за 30 дней', async () => {
    const { db } = fakeDb();
    const data = await collectFunnel(db, NOW);
    expect(data.agents.map((a) => a.agent)).toEqual(['sites', 'providers']);
    const [s, p] = data.agents;
    expect(s).toMatchObject({
      found: 50,
      contacted: 20,
      replied: 6,
      agreed: 4,
      paid: 3,
      active: 3,
    });
    expect(s!.fromContacted).toEqual({ replied: 5, agreed: 2, paid: 1, active: 2, registered: 0 });
    expect(p).toMatchObject({ found: 30, contacted: 9, registered: 2 });
    expect(p!.fromContacted.registered).toBe(1);
    // 2000 своя + 1800 из настроек офиса; просроченный не считается.
    expect(data.revenue).toBe(3800);
    expect(data.siteLeads).toBe(6);
    expect(data.siteLeadsUndelivered).toBe(1);
    expect(data.stock).toEqual([
      { agent: 'sites', withEmail: 250 },
      { agent: 'providers', withEmail: 45 },
    ]);
    expect(data.dailyCap).toBe(25);
    expect(stockNotes(data)[0]!.text).toContain('≈ 10 рабочих дней при лимите 25 в день');
  });

  it('спрашивает базу только счётчиками и ограниченным списком', async () => {
    const { db, countCalls, leadCalls, findManyCalls } = fakeDb();
    await collectFunnel(db, NOW);
    expect(countCalls).toHaveLength(8);
    for (const kind of ['site', 'provider'] as const) {
      expect(countCalls).toContainEqual(stockWhere(kind));
      expect(countCalls).toContainEqual({ kind });
      expect(countCalls).toContainEqual({ kind, contactedAt: { not: null } });
    }
    // «Активные» сайты — только клиенты: отказ с неистёкшим paidUntil не считается.
    expect(countCalls).toContainEqual({
      kind: 'site',
      paidUntil: { gt: NOW },
      status: { in: ['AGREED', 'PUBLISHED'] },
    });
    expect(countCalls).toContainEqual({ kind: 'provider', paidUntil: { gt: NOW } });
    const since = new Date(NOW.getTime() - 30 * DAY);
    expect(leadCalls).toEqual(
      expect.arrayContaining([
        { createdAt: { gte: since } },
        { createdAt: { gte: since }, forwardedAt: null },
      ]),
    );
    expect(findManyCalls).toEqual([
      expect.objectContaining({
        where: { kind: 'site', paidUntil: { gt: NOW }, status: { in: ['AGREED', 'PUBLISHED'] } },
        orderBy: { paidUntil: 'desc' },
        take: 5000,
      }),
    ]);
  });

  it('из строк таблицы получается то, что видит владелец', async () => {
    const { db } = fakeDb();
    const rows = funnelRows(await collectFunnel(db, NOW));
    const replied = rows.find((r) => r.stage === 'replied')!;
    expect(replied.cells.sites).toEqual({ count: 6, share: '25%' });
    expect(replied.cells.providers).toEqual({ count: 3, share: '33%' });
  });
});
