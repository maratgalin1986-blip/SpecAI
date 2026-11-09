// Офис агентов: утренняя сводка владельцу в Telegram (spec §7, §12; R3, R15, R17).
// `buildDigest` — чистый текст по собранным данным; `collectDigest` достаёт их из базы.
// Сводку читает только владелец, поэтому телефоны и ссылки превью в ней уместны.

import { phoneText } from './pages';
import { prisma } from '@specai/database';
import { MSK, mskDate, mskDayBounds } from '@/lib/adminCrm';
import { siteUrl } from '@/lib/siteUrl';
import { AGENTS, AGENT_IDS } from './agents';
import { nicheTitle } from './niches';
import { OFFICE_SETTINGS, formatPlan, nextStep } from './plan';
import { resolvePlan } from './run';
import type { AgentId, ProspectKind } from './types';

/** Не больше стольких кандидатов в каждом списке сводки; остальное — «и ещё N». */
export const DIGEST_LIST_LIMIT = 10;

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

function list(title: string, items: ProspectLite[], base: string): string[] {
  if (items.length === 0) return [];
  const out = [`${title} (${items.length}):`];
  items.slice(0, DIGEST_LIST_LIMIT).forEach((p, i) => out.push(`${i + 1}. ${line(p, base)}`));
  const rest = items.length - DIGEST_LIST_LIMIT;
  if (rest > 0) out.push(`и ещё ${rest} в админке`);
  return out;
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
  const quiet =
    created === 0 &&
    input.toContact.length === 0 &&
    input.replied.length === 0 &&
    input.callbacks.length === 0 &&
    input.contacted.email === 0 &&
    input.contacted.whatsapp === 0 &&
    input.registered === 0;

  if (quiet) {
    const tail = input.paused
      ? 'план на паузе'
      : input.nextStep
        ? `следующий шаг — ${input.nextStep}`
        : 'план продолжается';
    const maps = failedRuns ? `; источник карт не отвечал (${failedRuns})` : '';
    return `Офис: за ночь новых кандидатов нет, ${tail}${maps}. Открыть офис: ${base}/admin/office`;
  }

  const out: string[] = [`Офис за сутки (${formatDay(input.date)}):`, agentSummary(input.runs)];
  if (input.paused) out.push('Поиск на паузе.');
  if (input.contacted.email || input.contacted.whatsapp) {
    out.push(`Отправлено: писем ${input.contacted.email}, WhatsApp ${input.contacted.whatsapp}.`);
  }
  if (input.outreachPaused) out.push('Рассылка на паузе.');
  out.push(...list('Ответили', input.replied, base));
  out.push(...list('Готовы к отправке', input.toContact, base));
  out.push(...list('Напомнить сегодня', input.callbacks, base));
  if (input.registered > 0) out.push(`Зарегистрировались по ссылке: ${input.registered}`);
  out.push(`Открыть офис: ${base}/admin/office`);
  return out.join('\n');
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
  };
  appSetting: {
    findMany(args: {
      where: { key: { in: string[] } };
      select: { key: true; value: true };
    }): Promise<{ key: string; value: string }[]>;
  };
}

const LIST_TAKE = 50;

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
  });
}
