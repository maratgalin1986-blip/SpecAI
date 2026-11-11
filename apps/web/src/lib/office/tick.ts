// Один «тик» офиса — общая работа для любого планировщика (lib/office, spec § 7).
//
// Расписания GitHub Actions у небольшого репозитория срабатывают раз в
// несколько часов, а не каждый час, поэтому один вызов делает столько шагов
// плана, сколько влезает в бюджет времени (до maxSteps), потом рассылает письма
// и WhatsApp и, если сегодня ещё не было, шлёт владельцу сводку. Тот же тик
// вызывает и ежедневный крон Vercel — страховка на случай, когда GitHub молчит
// весь день. Два вызова подряд (два workflow, ручной перезапуск) не удваивают
// работу: второй тик в течение TICK_LOCK_MS отвечает `skipped: 'busy'`.
// В режиме рассылки 'auto' (по умолчанию с 2026-11-11, решение владельца) тик сам отправляет
// первые письма днём по Москве. В режиме 'approve' (К2) тик писем не отправляет: sendOutreach
// готовит «письма дня» и возвращает, сколько их ждёт кнопки владельца, — это число уходит в сводку.

import { prisma } from '@specai/database';
import { siteUrl } from '@/lib/siteUrl';
import { onceADay } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import {
  DIGEST_HOURS,
  collectDigest,
  moscowHour,
  splitForTelegram,
  type DigestExtra,
  outreachNotes,
} from './digest';
import { sendOutreach, type OutreachResult } from './outreachRun';
import { runScheduledStep, type ScheduledStepResult } from './run';
import { OVERPASS_TOTAL_MS } from './sources/osm';
import { OFERTA_LEADS_DELETE_DAYS } from './oferta';
import { SITE_LEAD_RETENTION_MONTHS } from './sitePolicy';

export interface TickOptions {
  /** Сколько миллисекунд есть у всего тика (функция Vercel живёт 60 с). */
  budgetMs: number;
  /** Не больше стольких шагов плана за один тик. */
  maxSteps: number;
  /**
   * `window` — сводка с DIGEST_HOURS.from по Москве до конца дня (обычный тик);
   * `any` — в любой час, если сегодня ещё не было (дневной крон-страховка).
   */
  digest: 'window' | 'any';
}

export interface TickDeps {
  /** Удаление заявок с клиентских сайтов старше срока хранения. */
  purgeLeads?: (now: Date) => Promise<unknown>;
  step?: (now: Date, budgetMs: number) => Promise<ScheduledStepResult>;
  outreach?: (now: Date, budgetMs: number) => Promise<OutreachResult>;
  sendDigest?: (now: Date, extra: DigestExtra) => Promise<boolean | null>;
  /** Замок от одновременных тиков: true — замок взят, false — занято. */
  lock?: (now: Date) => Promise<boolean>;
  clock?: () => number;
}

export type TickStep =
  | { skipped: string }
  | {
      agent: string;
      niche: string;
      city: string;
      found: number;
      created: number;
      skipped: number;
      error: string | null;
    };

export type TickResult =
  { skipped: 'busy' } | { steps: TickStep[]; outreach: OutreachResult; digest: boolean };

/** Сколько времени оставить рассылке и сводке после шагов поиска. */
export const TICK_RESERVE_MS = 15_000;
/** Шаг поиска не начинается, если на него осталось меньше этого. */
export const STEP_MIN_MS = 12_000;
/** Второй тик раньше чем через столько — «занято» (два workflow, ручной перезапуск). */
export const TICK_LOCK_MS = 10 * 60_000;

function publicStep(result: ScheduledStepResult): TickStep {
  if (result.skipped) return { skipped: result.skipped };
  return {
    agent: result.step.agent,
    niche: result.step.niche,
    city: result.step.city,
    found: result.result.found,
    created: result.result.created,
    skipped: result.result.skipped,
    error: result.result.error,
  };
}

/** Ключ замка — десятиминутное окно; строка в AdminFeedRead, как у onceADay. */
export function tickLockKey(now: Date): string {
  const slot = Math.floor(now.getTime() / TICK_LOCK_MS);
  return `cron:office-tick:${slot}`;
}

async function defaultLock(now: Date): Promise<boolean> {
  try {
    await prisma.adminFeedRead.create({ data: { key: tickLockKey(now) } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return false;
    throw error;
  }
}

/** Заявки посетителей клиентских сайтов старше срока из политики — удаляются. */
export async function purgeOldSiteLeads(now: Date): Promise<number> {
  const before = new Date(now);
  before.setMonth(before.getMonth() - SITE_LEAD_RETENTION_MONTHS);
  const { count } = await prisma.siteLead.deleteMany({ where: { createdAt: { lt: before } } });
  return count;
}

/** Ровно те запросы, что нужны удалению заявок ушедших клиентов (prisma подходит структурно). */
export interface LeadPurgeDb {
  siteLead: {
    findMany(args: {
      distinct: ['prospectId'];
      select: { prospectId: true };
      take: number;
    }): Promise<{ prospectId: string }[]>;
    deleteMany(args: { where: { prospectId: { in: string[] } } }): Promise<{ count: number }>;
  };
  prospect: {
    findMany(args: {
      where: { id: { in: string[] }; status: 'DECLINED'; declinedAt: { lt: Date } };
      select: { id: true };
    }): Promise<{ id: string }[]>;
  };
}

/** Сайтов с заявками немного; больше за один проход не читаем — остальные в следующий. */
const LEAD_OWNERS_TAKE = 1000;

/**
 * Оферта (п. 7.2, OFERTA_LEADS_DELETE_DAYS) обещает клиенту удалить заявки посетителей его сайта
 * после прекращения договора. Договор прекращён — сайт снят («Отказ», статус DECLINED); через
 * обещанный срок заявки этого сайта удаляются. Клиент вернулся («Согласился») — заявки остаются.
 */
export async function purgeTerminatedSiteLeads(
  now: Date,
  db: LeadPurgeDb = prisma,
): Promise<number> {
  const owners = await db.siteLead.findMany({
    distinct: ['prospectId'],
    select: { prospectId: true },
    take: LEAD_OWNERS_TAKE,
  });
  if (owners.length === 0) return 0;
  const cutoff = new Date(now.getTime() - OFERTA_LEADS_DELETE_DAYS * 24 * 60 * 60 * 1000);
  const gone = await db.prospect.findMany({
    where: {
      id: { in: owners.map((o) => o.prospectId) },
      status: 'DECLINED',
      declinedAt: { lt: cutoff },
    },
    select: { id: true },
  });
  if (gone.length === 0) return 0;
  const { count } = await db.siteLead.deleteMany({
    where: { prospectId: { in: gone.map((p) => p.id) } },
  });
  return count;
}

/** Оба срока хранения заявок посетителей: по политике сайта и по оферте. */
export async function purgeSiteLeads(now: Date): Promise<number> {
  return (await purgeOldSiteLeads(now)) + (await purgeTerminatedSiteLeads(now));
}

/**
 * Шлёт сводку частями по порядку. true — только если Telegram принял все части: иначе onceADay
 * не ставит отметку и следующий тик повторит отправку. После отказа остальные части не шлём.
 */
export async function sendDigestChunks(
  text: string,
  send: (chunk: string) => Promise<boolean> = notifyTelegram,
): Promise<boolean> {
  const chunks = splitForTelegram(text);
  if (chunks.length === 0) return false;
  for (const chunk of chunks) {
    if (!(await send(chunk))) return false;
  }
  return true;
}

async function defaultDigest(now: Date, extra: DigestExtra): Promise<boolean | null> {
  return onceADay(
    'office-digest',
    async () => sendDigestChunks(await collectDigest(now, undefined, extra)),
    now,
  );
}

/** Ответ содержит только числа и служебные слова — без имён, телефонов и токенов. */
export async function officeTick(
  now: Date,
  options: TickOptions,
  deps: TickDeps = {},
): Promise<TickResult> {
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const left = () => options.budgetMs - (clock() - startedAt);

  const locked = await (deps.lock ?? defaultLock)(now).catch((error: unknown) => {
    console.error('[office] tick lock failed', error);
    return true;
  });
  if (!locked) return { skipped: 'busy' };

  const runStep = deps.step ?? ((at: Date, budgetMs: number) => runScheduledStep(at, { budgetMs }));
  const steps: TickStep[] = [];

  for (let i = 0; i < Math.max(0, options.maxSteps); i++) {
    // Шагу отдаётся всё, что останется сверх резерва, но не больше, чем он
    // способен потратить; меньше STEP_MIN_MS — не начинаем.
    const stepBudget = Math.min(left() - TICK_RESERVE_MS, OVERPASS_TOTAL_MS + 5_000);
    if (stepBudget < STEP_MIN_MS) break;
    let result: ScheduledStepResult;
    try {
      result = await runStep(new Date(), stepBudget);
    } catch (error) {
      console.error('[office] step failed', error);
      steps.push({ skipped: 'error' });
      break;
    }
    steps.push(publicStep(result));
    // На паузе, пустой план или ошибка источника — дальше шаги не нужны.
    if (result.skipped || result.result.error) break;
  }

  // Рассылке — остаток за вычетом времени на сводку и ответ; её собственный
  // порог «меньше 2 с — не начинать» внутри sendOutreach.
  const outreach = await (
    deps.outreach ?? ((at, budget) => sendOutreach(at, { budgetMs: budget }))
  )(now, left() - 5_000).catch((error: unknown) => {
    console.error('[office] outreach failed', error);
    return { email: 0, whatsapp: 0, skipped: 'error', errors: 0 } as OutreachResult;
  });

  // Политика клиентских сайтов обещает хранить заявки посетителей не дольше
  // SITE_LEAD_RETENTION_MONTHS (lib/office/sitePolicy.ts), оферта — удалить их после
  // прекращения договора (OFERTA_LEADS_DELETE_DAYS): и то и другое удаляем здесь.
  await (deps.purgeLeads ?? purgeSiteLeads)(now).catch((error: unknown) => {
    console.error('[office] site lead purge failed', error);
  });

  let digest = false;
  const hour = moscowHour(now);
  const inWindow = hour >= DIGEST_HOURS.from && hour <= DIGEST_HOURS.to;
  if (options.digest === 'any' || inWindow) {
    const notes = outreachNotes(outreach, siteUrl());
    const extra: DigestExtra = {
      ...(outreach.waiting ? { outboxWaiting: outreach.waiting } : {}),
      ...(notes.length ? { outreachNotes: notes } : {}),
    };
    const sent = await (deps.sendDigest ?? defaultDigest)(now, extra).catch((error: unknown) => {
      console.error('[office] digest failed', error);
      return null;
    });
    digest = sent === true;
  }
  return { steps, outreach, digest };
}
