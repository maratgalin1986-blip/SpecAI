// Офис агентов: утренняя сводка владельцу в Telegram (spec §7, §12; R3, R15, R17).
// `buildDigest` — чистый текст по собранным данным; `collectDigest` достаёт их из базы.
// Сводку читает только владелец, поэтому телефоны и ссылки превью в ней уместны.
// «Сайты под ключ» как бизнес (S4, S6): заявки с клиентских сайтов за сутки и оплата
// клиентов, которая скоро кончится или уже кончилась.
// Вторая волна (U3): лучший заход персональных предложений и «горячие» — открыли превью за
// 7 дней и ещё не ответили (им пора позвонить).

import { EMPTY_RUNS, FAILING_RUNS } from './searchHealth';
import { phoneText } from './pages';
import { prisma } from '@specai/database';
import { MSK, mskDate, mskDayBounds } from '@/lib/adminCrm';
import { siteUrl } from '@/lib/siteUrl';
import { AGENTS, AGENT_IDS } from './agents';
import { BILLABLE_STATUSES, EXPIRING_DAYS } from './billing';
import { angleLeader, collectAngleStats, learningTable, type LearningDb } from './learning';
import { nicheTitle } from './niches';
import { ANGLE_TITLES } from './offer';
import { OFFICE_SETTINGS, formatPlan, nextStep } from './plan';
import { resolvePlan } from './run';
import type { AgentId, ProspectKind } from './types';

/** Не больше стольких кандидатов в каждом списке сводки; остальное — «и ещё N». */
export const DIGEST_LIST_LIMIT = 10;
/** «Горячих» в сводке — не больше стольких строк. */
export const DIGEST_HOT_LIMIT = 5;
/** «Горячие» — открыли превью за столько дней и не ответили. */
export const HOT_DAYS = 7;
/** Кто ещё может ответить: написали или ждут звонка. */
export const HOT_STATUSES = ['CONTACTED', 'CALLBACK'] as const;

/** Окно отправки сводки — московские часы, включительно. */
/**
 * Сводка уходит при первом вызове после 08:00 по Москве и до конца дня (раз в
 * день — onceADay): расписание GitHub срабатывает редко и окно 08–10 можно
 * просто проспать.
 */
export const DIGEST_HOURS = { from: 8, to: 23 } as const;

/** Час по Москве, 0–23. */
export function moscowHour(now: Date): number {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: MSK,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number.parseInt(text, 10) % 24;
}

export interface ProspectLite {
  name: string;
  city: string | null;
  niche: string;
  phone: string;
  token: string;
  kind: ProspectKind;
  email?: string | null;
  whatsapp?: string | null;
}

export interface DigestRun {
  agent: string;
  niche: string;
  city: string;
  found: number;
  created: number;
  error: string | null;
}

export interface DigestInput {
  date: Date;
  /** Прогоны за сутки. */
  runs: DigestRun[];
  /** READY — страница готова, сообщение ещё не отправлено. */
  toContact: ProspectLite[];
  /** Отправлено за сутки по каналам. */
  contacted: { email: number; whatsapp: number };
  /** Ответили за сутки. */
  replied: ProspectLite[];
  /** CALLBACK с датой напоминания сегодня или раньше. */
  callbacks: ProspectLite[];
  /** Подрядчиков зарегистрировалось по ссылке за сутки. */
  registered: number;
  siteUrl: string;
  paused: boolean;
  outreachPaused: boolean;
  /** Следующий шаг плана — для короткой строки, когда новостей нет. */
  nextStep?: string | null;
  /** Заявки с клиентских сайтов за сутки: всего и не доставлено компании. */
  siteLeads?: { total: number; undelivered: number };
  /**
   * Клиенты «Сайтов под ключ»: оплата поддержки кончается за EXPIRING_DAYS дней и уже
   * кончилась. Это состояние, а не новость дня, поэтому тихую сводку оно не отменяет.
   */
  billing?: { expiring: number; overdue: number };
  /** Лучший заход предложений по ответам (learningTable → angleLeader); нет данных — не задан. */
  bestAngle?: { title: string; replied: number; sent: number } | null;
  /** Открыли превью за HOT_DAYS дней и не ответили (новые первыми). */
  hot?: ProspectLite[];
  /** Писем дня ждут кнопки «Отправить» на /admin/office/pisma (К2). */
  outboxWaiting?: number;
}

/** То, что тик знает сам и передаёт в сводку (К2: сколько писем дня ждут владельца). */
export interface DigestExtra {
  outboxWaiting?: number;
}

/** Строка сводки о письмах дня (К2). */
export function outboxLine(waiting: number | undefined, base: string): string | null {
  if (!waiting || waiting <= 0) return null;
  return `Письма дня ждут вашего «Отправить»: ${waiting} — ${base}/admin/office/pisma`;
}

function formatDay(date: Date): string {
  const [, m, d] = mskDate(date).split('-');
  return `${d}.${m}`;
}

function line(p: ProspectLite, base: string): string {
  const parts = [p.name, p.city, nicheTitle(p.niche), phoneText(p.phone)].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return `${parts.join(' · ')} · превью: ${base}/preview/${p.token}`;
}

function list(
  title: string,
  items: ProspectLite[],
  base: string,
  limit: number = DIGEST_LIST_LIMIT,
): string[] {
  if (items.length === 0) return [];
  const out = [`${title} (${items.length}):`];
  items.slice(0, limit).forEach((p, i) => out.push(`${i + 1}. ${line(p, base)}`));
  const rest = items.length - limit;
  if (rest > 0) out.push(`и ещё ${rest} в админке`);
  return out;
}

function siteLeadsLine(leads: DigestInput['siteLeads']): string | null {
  if (!leads || leads.total <= 0) return null;
  const lost = leads.undelivered > 0 ? ` (не доставлено клиентам: ${leads.undelivered})` : '';
  return `Заявок с клиентских сайтов: ${leads.total}${lost}`;
}

function billingLine(billing: DigestInput['billing'], base: string): string | null {
  if (!billing) return null;
  const parts: string[] = [];
  if (billing.expiring > 0) parts.push(`истекает за ${EXPIRING_DAYS} дней — ${billing.expiring}`);
  if (billing.overdue > 0) parts.push(`просрочена — ${billing.overdue}`);
  if (parts.length === 0) return null;
  return `Оплата: ${parts.join(', ')}. Клиенты: ${base}/admin/office/clients`;
}

function agentSummary(runs: DigestRun[]): string {
  const parts = AGENT_IDS.map((id: AgentId) => {
    const own = runs.filter((r) => r.agent === id);
    const found = own.reduce((s, r) => s + r.found, 0);
    const created = own.reduce((s, r) => s + r.created, 0);
    const failed = own.filter((r) => r.error).length;
    let text = `${AGENTS[id].name} — найдено ${found}, страниц ${created}`;
    if (failed) text += ` (источник карт не отвечал: ${failed} ${failed === 1 ? 'шаг' : 'шага'})`;
    return text;
  });
  return parts.join('; ');
}

/** Текст сводки. Когда нечего рассказать — одна короткая строка. */
export function buildDigest(input: DigestInput): string {
  const base = input.siteUrl.replace(/\/+$/, '');
  const created = input.runs.reduce((s, r) => s + r.created, 0);
  const failedRuns = input.runs.filter((r) => r.error).length;
  const leads = siteLeadsLine(input.siteLeads);
  const billing = billingLine(input.billing, base);
  const hot = input.hot ?? [];
  const outbox = outboxLine(input.outboxWaiting, base);
  const quiet =
    !outbox &&
    created === 0 &&
    input.toContact.length === 0 &&
    input.replied.length === 0 &&
    input.callbacks.length === 0 &&
    input.contacted.email === 0 &&
    input.contacted.whatsapp === 0 &&
    input.registered === 0 &&
    hot.length === 0 &&
    !leads;

  // Все шаги за сутки упали — это первая строка сводки, а не хвост «тихой» (урок 9–10.11.2026).
  const searchDown =
    input.runs.length >= FAILING_RUNS && failedRuns === input.runs.length
      ? `Поиск фирм не работает: все шаги за сутки (${failedRuns}) закончились ошибкой источника карт. Новых кандидатов не будет, пока его не починить.`
      : // Ошибок нет, но и ни одной новой фирмы за все шаги суток — поиск крутится вхолостую.
        input.runs.length >= EMPTY_RUNS && failedRuns === 0 && created === 0
        ? `Поиск за сутки не дал новых фирм (шагов: ${input.runs.length}).`
        : null;

  if (quiet && searchDown) {
    const text = `${searchDown} Открыть офис: ${base}/admin/office`;
    return billing ? `${text}\n${billing}` : text;
  }
  if (quiet) {
    const tail = input.paused
      ? 'план на паузе'
      : input.nextStep
        ? `следующий шаг — ${input.nextStep}`
        : 'план продолжается';
    const maps = failedRuns ? `; источник карт не отвечал (${failedRuns})` : '';
    const text = `Офис: за ночь новых кандидатов нет, ${tail}${maps}. Открыть офис: ${base}/admin/office`;
    return billing ? `${text}\n${billing}` : text;
  }

  const out: string[] = [`Офис за сутки (${formatDay(input.date)}):`, agentSummary(input.runs)];
  if (searchDown) out.unshift(searchDown);
  if (input.paused) out.push('Поиск на паузе.');
  if (input.contacted.email || input.contacted.whatsapp) {
    out.push(`Отправлено: писем ${input.contacted.email}, WhatsApp ${input.contacted.whatsapp}.`);
  }
  if (input.outreachPaused) out.push('Рассылка на паузе.');
  out.push(...list('Ответили', input.replied, base));
  out.push(...list('Готовы к отправке', input.toContact, base));
  out.push(...list('Напомнить сегодня', input.callbacks, base));
  out.push(...list('Горячие (открыли превью)', hot, base, DIGEST_HOT_LIMIT));
  if (input.registered > 0) out.push(`Зарегистрировались по ссылке: ${input.registered}`);
  if (leads) out.push(leads);
  if (billing) out.push(billing);
  if (input.bestAngle && input.bestAngle.sent > 0) {
    const b = input.bestAngle;
    out.push(`Лучший заход: ${b.title} (ответили ${b.replied} из ${b.sent})`);
  }
  if (outbox) out.push(outbox);
  out.push(`Открыть офис: ${base}/admin/office`);
  return out.join('\n');
}

/** Telegram принимает сообщение до 4096 знаков; режем с запасом. */
export const TELEGRAM_CHUNK = 4000;

/**
 * Делит длинный текст на части не длиннее `max` по переводам строк (урок 10.11.2026: длинную
 * сводку Telegram отклонял целиком, и её молча не было). Строку длиннее `max` режет жёстко.
 */
export function splitForTelegram(text: string, max: number = TELEGRAM_CHUNK): string[] {
  const chunks: string[] = [];
  let current: string | null = null;
  for (const raw of text.split('\n')) {
    let piece = raw;
    while (piece.length > max) {
      if (current !== null) chunks.push(current);
      current = null;
      chunks.push(piece.slice(0, max));
      piece = piece.slice(max);
    }
    if (current === null) current = piece;
    else if (current.length + 1 + piece.length <= max) current += `\n${piece}`;
    else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current !== null) chunks.push(current);
  return chunks.filter((c) => c.length > 0);
}

const LITE_SELECT = {
  name: true,
  city: true,
  niche: true,
  phone: true,
  token: true,
  kind: true,
  email: true,
  whatsapp: true,
} as const;

type LiteRow = {
  name: string;
  city: string | null;
  niche: string;
  phone: string;
  token: string;
  kind: string;
  email: string | null;
  whatsapp: string | null;
};

/** Минимум базы для сводки; `prisma` подходит как есть. */
export interface DigestDb {
  /** Отметки onceADay («cron:office-digest:<день>:done») — с них начинается следующая сводка. */
  adminFeedRead?: {
    findFirst(args: {
      where: { key: { startsWith: string; endsWith: string } };
      orderBy: { readAt: 'desc' };
      select: { readAt: true };
    }): Promise<{ readAt: Date } | null>;
  };
  officeRun: {
    findMany(args: {
      where: { startedAt: { gte: Date } };
      select: {
        agent: true;
        niche: true;
        city: true;
        found: true;
        created: true;
        error: true;
      };
      orderBy: { startedAt: 'desc' };
      take: number;
    }): Promise<DigestRun[]>;
  };
  prospect: {
    findMany(args: {
      where: Record<string, unknown>;
      select: typeof LITE_SELECT;
      orderBy: Record<string, 'asc' | 'desc'>;
      take: number;
    }): Promise<LiteRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    /** Статистика заходов (learning.ts); без неё строки «Лучший заход» нет. */
    groupBy?: LearningDb['prospect']['groupBy'];
  };
  appSetting: {
    findMany(args: {
      where: { key: { in: string[] } };
      select: { key: true; value: true };
    }): Promise<{ key: string; value: string }[]>;
  };
  /** Заявки с клиентских сайтов (S4). */
  siteLead: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

const LIST_TAKE = 50;
const DAY_MS = 86_400_000;

function lite(rows: LiteRow[]): ProspectLite[] {
  return rows.map((r) => ({
    name: r.name,
    city: r.city,
    niche: r.niche,
    phone: r.phone,
    token: r.token,
    kind: r.kind === 'site' ? 'site' : 'provider',
    email: r.email,
    whatsapp: r.whatsapp,
  }));
}

/** Собирает данные за сутки и возвращает текст сводки. */
/**
 * Начало окна сводки: момент предыдущей сводки (сводки уходят в разное время —
 * когда GitHub соизволит, — и окно «ровно сутки» то накладывалось бы, то рвалось),
 * но не раньше чем 48 часов назад и не позже чем сутки назад.
 */
export async function digestSince(now: Date, db: DigestDb): Promise<Date> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const last = await db.adminFeedRead
    ?.findFirst({
      where: { key: { startsWith: 'cron:office-digest:', endsWith: ':done' } },
      orderBy: { readAt: 'desc' },
      select: { readAt: true },
    })
    .catch(() => null);
  if (!last) return dayAgo;
  const at = last.readAt.getTime();
  return new Date(Math.min(dayAgo.getTime(), Math.max(twoDaysAgo.getTime(), at)));
}

export async function collectDigest(
  now: Date = new Date(),
  db: DigestDb = prisma,
  extra: DigestExtra = {},
): Promise<string> {
  const since = await digestSince(now, db);
  const { end: todayEnd } = mskDayBounds(now);
  const [runs, toContact, emailSent, whatsappSent, replied, callbacks, registered, settings] =
    await Promise.all([
      db.officeRun.findMany({
        where: { startedAt: { gte: since } },
        select: { agent: true, niche: true, city: true, found: true, created: true, error: true },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      db.prospect.findMany({
        where: { status: 'READY' },
        select: LITE_SELECT,
        orderBy: { createdAt: 'desc' },
        take: LIST_TAKE,
      }),
      db.prospect.count({ where: { emailSentAt: { gte: since } } }),
      db.prospect.count({ where: { whatsappSentAt: { gte: since } } }),
      db.prospect.findMany({
        where: { repliedAt: { gte: since } },
        select: LITE_SELECT,
        orderBy: { repliedAt: 'desc' },
        take: LIST_TAKE,
      }),
      db.prospect.findMany({
        where: { status: 'CALLBACK', callAt: { not: null, lt: todayEnd } },
        select: LITE_SELECT,
        orderBy: { callAt: 'asc' },
        take: LIST_TAKE,
      }),
      db.prospect.count({ where: { registeredAt: { gte: since } } }),
      db.appSetting.findMany({
        where: {
          key: {
            in: [
              OFFICE_SETTINGS.paused,
              OFFICE_SETTINGS.plan,
              OFFICE_SETTINGS.cursor,
              OFFICE_SETTINGS.outreachPaused,
            ],
          },
        },
        select: { key: true, value: true },
      }),
    ]);
  // Заявки с клиентских сайтов за окно сводки и оплата клиентов (S4, S6).
  const clients = { kind: 'site', status: { in: [...BILLABLE_STATUSES] } };
  const expiringBy = new Date(now.getTime() + EXPIRING_DAYS * DAY_MS);
  const [leadsTotal, leadsUndelivered, expiring, overdue] = await Promise.all([
    db.siteLead.count({ where: { createdAt: { gte: since } } }),
    db.siteLead.count({ where: { createdAt: { gte: since }, forwardedAt: null } }),
    db.prospect.count({ where: { ...clients, paidUntil: { gt: now, lte: expiringBy } } }),
    db.prospect.count({ where: { ...clients, paidUntil: { lte: now } } }),
  ]);
  // Горячие и лучший заход (U3). Статистика заходов не обязательна: её сбой сводку не ломает.
  const weekAgo = new Date(now.getTime() - HOT_DAYS * DAY_MS);
  const groupBy = db.prospect.groupBy;
  const [hot, stats] = await Promise.all([
    db.prospect.findMany({
      where: {
        status: { in: [...HOT_STATUSES] },
        repliedAt: null,
        previewLastViewedAt: { gte: weekAgo },
      },
      select: LITE_SELECT,
      orderBy: { previewLastViewedAt: 'desc' },
      take: DIGEST_HOT_LIMIT,
    }),
    groupBy
      ? collectAngleStats({ prospect: { groupBy: groupBy.bind(db.prospect) } }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const leader = stats ? angleLeader(learningTable(stats)) : null;
  const plan = resolvePlan(settings);
  const { step } = nextStep(plan.steps, plan.cursor);
  const outreachPaused =
    settings.find((s) => s.key === OFFICE_SETTINGS.outreachPaused)?.value.trim() === '1';
  return buildDigest({
    date: now,
    runs,
    toContact: lite(toContact),
    contacted: { email: emailSent, whatsapp: whatsappSent },
    replied: lite(replied),
    callbacks: lite(callbacks),
    registered,
    siteUrl: siteUrl(),
    paused: plan.paused,
    outreachPaused,
    nextStep: step ? formatPlan([step]) : null,
    siteLeads: { total: leadsTotal, undelivered: leadsUndelivered },
    billing: { expiring, overdue },
    hot: lite(hot),
    ...(extra.outboxWaiting ? { outboxWaiting: extra.outboxWaiting } : {}),
    bestAngle: leader
      ? { title: ANGLE_TITLES[leader.angle], replied: leader.replied, sent: leader.sent }
      : null,
  });
}
