// «Сайты под ключ» как бизнес (S10): воронка офиса для /admin/office. По каждому агенту —
// найдено → написали → ответили → согласились → оплатили → активные (у «Подрядчиков» вместо
// оплаты — регистрация по ссылке); доли — от «написали»; выручка в месяц и заявки с
// клиентских сайтов за 30 дней; запас кандидатов с почтой в днях отправки (К15).
// `collectFunnel` — только count-запросы (и один список
// оплативших для выручки), `funnelRows` / `funnelNotes` — чистые, их проверяют тесты.

import { prisma } from '@specai/database';
import { monthlyRevenue, type BillingProspect } from './billing';
import { AGENTS } from './agents';
import { OFFICE_SETTINGS } from './plan';
import { parseOfficePrices } from './prices';
import { rubles } from './scripts';
import { DEFAULT_DAILY_CAP } from './settings';
import type { AgentId, ProspectKind } from './types';

/** Порядок столбцов: сначала «Сайты под ключ» — это бизнес, затем «Подрядчики». */
export const FUNNEL_AGENTS: readonly AgentId[] = ['sites', 'providers'];

/** Заявки с клиентских сайтов — за столько дней. */
export const SITE_LEADS_DAYS = 30;

/** Выручка считается по стольким оплатившим клиентам (с запасом на годы вперёд). */
export const REVENUE_TAKE = 5000;

const DAY_MS = 86_400_000;

/**
 * Запас меньше стольких рабочих дней отправки — пора подключать новые ниши и города
 * (docs/business/sajty-pod-klyuch.md: «когда запас кандидатов с почтой меньше 10 рабочих дней»).
 */
export const STOCK_LOW_DAYS = 10;

export type FunnelStage =
  'found' | 'contacted' | 'replied' | 'agreed' | 'paid' | 'active' | 'registered';

/** Этапы после «написали» — у них есть доля. */
type LaterStage = Exclude<FunnelStage, 'found' | 'contacted'>;

interface StageInfo {
  stage: FunnelStage;
  title: string;
  hint: string;
  /** У каких агентов этап есть; у остальных — прочерк. */
  agents: readonly AgentId[];
}

export const FUNNEL_STAGES: readonly StageInfo[] = [
  {
    stage: 'found',
    title: 'Найдено',
    hint: 'все кандидаты агента',
    agents: ['sites', 'providers'],
  },
  {
    stage: 'contacted',
    title: 'Написали',
    hint: 'отправлено письмо или WhatsApp',
    agents: ['sites', 'providers'],
  },
  {
    stage: 'replied',
    title: 'Ответили',
    hint: 'отмечен ответ',
    agents: ['sites', 'providers'],
  },
  {
    stage: 'agreed',
    title: 'Согласились',
    hint: 'отмечено «Согласился», страница опубликована',
    agents: ['sites', 'providers'],
  },
  {
    stage: 'paid',
    title: 'Оплатили',
    hint: 'отмечена оплата сайта',
    agents: ['sites'],
  },
  {
    stage: 'active',
    title: 'Активные',
    hint: 'поддержка оплачена на сегодня',
    agents: ['sites'],
  },
  {
    stage: 'registered',
    title: 'Зарегистрировались',
    hint: 'по ссылке со своей страницы',
    agents: ['providers'],
  },
];

/** Числа воронки одного агента. */
export interface AgentFunnel {
  agent: AgentId;
  found: number;
  contacted: number;
  replied: number;
  agreed: number;
  paid: number;
  active: number;
  registered: number;
  /** Сколько из тех, кому написали, дошли до этапа: из них считаются доли. */
  fromContacted: Record<LaterStage, number>;
}

/** Запас агента (К15): кандидаты с почтой, которым ещё не писали. */
export interface AgentStock {
  agent: AgentId;
  withEmail: number;
}

export interface FunnelData {
  agents: AgentFunnel[];
  /** Запас кандидатов с почтой по агентам. */
  stock: AgentStock[];
  /** Писем в день (`office.dailyCap`, общий для агентов). */
  dailyCap: number;
  /** Выручка в месяц, ₽: поддержка клиентов с действующей оплатой. */
  revenue: number;
  /** Заявок с клиентских сайтов за SITE_LEADS_DAYS дней. */
  siteLeads: number;
  /** Из них не доставлено компании (нет почты или письмо не ушло). */
  siteLeadsUndelivered: number;
}

export interface FunnelCell {
  count: number;
  /** «40%» от «написали»; null — у этапа доли нет или писать ещё некому. */
  share: string | null;
}

export interface FunnelRow {
  stage: FunnelStage;
  title: string;
  hint: string;
  /** По агенту; null — этапа у агента нет. */
  cells: Record<AgentId, FunnelCell | null>;
}

/**
 * Доля в процентах, целым числом. Неполная доля не округляется до «0%» и «100%»: одна
 * согласившаяся фирма из трёхсот — «1%», двести девяносто девять из трёхсот — «99%».
 */
export function funnelShare(part: number, base: number): string | null {
  if (!Number.isFinite(base) || base <= 0) return null;
  const n = Math.max(0, Math.min(Number.isFinite(part) ? part : 0, base));
  let percent = Math.round((n / base) * 100);
  if (n > 0 && n < base) percent = Math.min(99, Math.max(1, percent));
  return `${percent}%`;
}

function cell(f: AgentFunnel, stage: FunnelStage): FunnelCell {
  if (stage === 'found' || stage === 'contacted') return { count: f[stage], share: null };
  return { count: f[stage], share: funnelShare(f.fromContacted[stage], f.contacted) };
}

/** Строки таблицы воронки: этап → число и доля от «написали» у каждого агента. */
export function funnelRows(data: Pick<FunnelData, 'agents'>): FunnelRow[] {
  return FUNNEL_STAGES.map((info) => {
    const cells = {} as Record<AgentId, FunnelCell | null>;
    for (const agent of FUNNEL_AGENTS) {
      const f = data.agents.find((a) => a.agent === agent);
      cells[agent] = f && info.agents.includes(agent) ? cell(f, info.stage) : null;
    }
    return { stage: info.stage, title: info.title, hint: info.hint, cells };
  });
}

/** Строки под таблицей: выручка в месяц и заявки с клиентских сайтов. */
export function funnelNotes(data: FunnelData): string[] {
  const leads =
    `Заявок с клиентских сайтов за ${SITE_LEADS_DAYS} дней: ${data.siteLeads}` +
    (data.siteLeadsUndelivered > 0
      ? ` (не доставлено клиентам: ${data.siteLeadsUndelivered})`
      : '');
  return [`Выручка в месяц: ${rubles(data.revenue)}`, leads];
}

/** «1 рабочий день», «3 рабочих дня», «12 рабочих дней». */
export function workingDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} рабочий день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} рабочих дня`;
  return `${n} рабочих дней`;
}

/** На сколько рабочих дней отправки хватит запаса; null — лимит 0, рассылка не идёт. */
export function stockDays(withEmail: number, dailyCap: number): number | null {
  const cap = Number.isFinite(dailyCap) ? Math.floor(dailyCap) : 0;
  if (cap <= 0) return null;
  const n = Number.isFinite(withEmail) ? Math.max(0, Math.floor(withEmail)) : 0;
  return Math.floor(n / cap);
}

export interface StockNote {
  agent: AgentId;
  text: string;
  /** Запаса меньше STOCK_LOW_DAYS дней — пора добавлять ниши или города. */
  low: boolean;
}

/** Строки запаса по агентам (К15), в порядке столбцов воронки. */
export function stockNotes(data: Pick<FunnelData, 'stock' | 'dailyCap'>): StockNote[] {
  return FUNNEL_AGENTS.flatMap((agent) => {
    const row = data.stock.find((s) => s.agent === agent);
    if (!row) return [];
    const days = stockDays(row.withEmail, data.dailyCap);
    const head = `${AGENTS[agent].name}: запас кандидатов с почтой — ${row.withEmail}`;
    if (days === null) {
      return [{ agent, text: `${head} (лимит писем в день — 0, рассылка не идёт)`, low: false }];
    }
    const low = days < STOCK_LOW_DAYS;
    const text =
      `${head} (≈ ${workingDays(days)} при лимите ${Math.floor(data.dailyCap)} в день)` +
      (low ? ' — пора добавить ниши или города' : '');
    return [{ agent, text, low }];
  });
}

/** Названия столбцов таблицы. */
export function funnelAgentTitle(agent: AgentId): string {
  return AGENTS[agent].name;
}

// ——— Сбор из базы ———

/** Счётчики непустых полей: `_all` — строк, остальные — строк с отметкой этапа. */
const STAGE_SELECT = {
  _all: true,
  contactedAt: true,
  repliedAt: true,
  agreedAt: true,
  setupPaidAt: true,
  registeredAt: true,
} as const;

export interface StageCounts {
  _all: number;
  contactedAt: number;
  repliedAt: number;
  agreedAt: number;
  setupPaidAt: number;
  registeredAt: number;
}

const REVENUE_SELECT = {
  setupPrice: true,
  monthlyPrice: true,
  setupPaidAt: true,
  paidUntil: true,
} as const;

/** Ровно те запросы, что нужны воронке (prisma подходит структурно). */
export interface FunnelDb {
  prospect: {
    count(args: {
      where: Record<string, unknown>;
      select: typeof STAGE_SELECT;
    }): Promise<StageCounts>;
    findMany(args: {
      where: Record<string, unknown>;
      select: typeof REVENUE_SELECT;
      orderBy: { paidUntil: 'desc' };
      take: number;
    }): Promise<BillingProspect[]>;
  };
  siteLead: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  appSetting: {
    findMany(args: {
      where: { key: { in: string[] } };
      select: { key: true; value: true };
    }): Promise<{ key: string; value: string }[]>;
  };
}

/**
 * Кандидаты агента, которым можно написать первое письмо (К15): ждут (READY), почта есть,
 * письма не было, не отписаны.
 */
export function stockWhere(kind: ProspectKind): Record<string, unknown> {
  return {
    kind,
    status: 'READY',
    email: { not: null },
    NOT: { email: '' },
    emailSentAt: null,
    optOutAt: null,
  };
}

/** Лимит писем в день из настройки; пусто или мусор — DEFAULT_DAILY_CAP (как в settings.ts). */
export function parseDailyCap(value: string | undefined): number {
  if (value === undefined) return DEFAULT_DAILY_CAP;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

/**
 * Числа агента из трёх счётчиков: все кандидаты, те, кому написали, и с действующей оплатой
 * (`_all` — сколько активных, `contactedAt` — сколько из них получили письмо).
 */
export function agentFunnel(
  agent: AgentId,
  all: StageCounts,
  contacted: StageCounts,
  active: StageCounts,
): AgentFunnel {
  return {
    agent,
    found: all._all,
    contacted: all.contactedAt,
    replied: all.repliedAt,
    agreed: all.agreedAt,
    paid: all.setupPaidAt,
    active: active._all,
    registered: all.registeredAt,
    fromContacted: {
      replied: contacted.repliedAt,
      agreed: contacted.agreedAt,
      paid: contacted.setupPaidAt,
      active: active.contactedAt,
      registered: contacted.registeredAt,
    },
  };
}

/**
 * Воронка из базы. «Активные» — оплата поддержки ещё не кончилась (`paidUntil` позже
 * текущего момента — как «оплачен»/«истекает» в lib/office/billing.ts); выручка — их
 * поддержка в месяц по ценам клиента или базовым ценам офиса.
 */
export async function collectFunnel(
  db: FunnelDb = prisma,
  now: Date = new Date(),
): Promise<FunnelData> {
  const leadsSince = new Date(now.getTime() - SITE_LEADS_DAYS * DAY_MS);
  const counts = (where: Record<string, unknown>) =>
    db.prospect.count({ where, select: STAGE_SELECT });
  const perAgent = FUNNEL_AGENTS.map(async (agent) => {
    const kind: ProspectKind = AGENTS[agent].kind;
    const [all, contacted, active, stock] = await Promise.all([
      counts({ kind }),
      counts({ kind, contactedAt: { not: null } }),
      counts({ kind, paidUntil: { gt: now } }),
      counts(stockWhere(kind)),
    ]);
    return {
      funnel: agentFunnel(agent, all, contacted, active),
      stock: { agent, withEmail: stock._all },
    };
  });
  const [perAgentData, paying, settings, siteLeads, siteLeadsUndelivered] = await Promise.all([
    Promise.all(perAgent),
    db.prospect.findMany({
      where: { kind: AGENTS.sites.kind, paidUntil: { gt: now } },
      select: REVENUE_SELECT,
      orderBy: { paidUntil: 'desc' },
      take: REVENUE_TAKE,
    }),
    db.appSetting.findMany({
      where: {
        key: {
          in: [OFFICE_SETTINGS.sitePrice, OFFICE_SETTINGS.siteMonthly, OFFICE_SETTINGS.dailyCap],
        },
      },
      select: { key: true, value: true },
    }),
    db.siteLead.count({ where: { createdAt: { gte: leadsSince } } }),
    db.siteLead.count({ where: { createdAt: { gte: leadsSince }, forwardedAt: null } }),
  ]);
  return {
    agents: perAgentData.map((a) => a.funnel),
    stock: perAgentData.map((a) => a.stock),
    dailyCap: parseDailyCap(settings.find((r) => r.key === OFFICE_SETTINGS.dailyCap)?.value),
    revenue: monthlyRevenue(paying, parseOfficePrices(settings), now),
    siteLeads,
    siteLeadsUndelivered,
  };
}
