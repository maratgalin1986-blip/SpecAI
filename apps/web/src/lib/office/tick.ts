// Один «тик» офиса — общая работа для любого планировщика (lib/office, spec § 7).
//
// Расписания GitHub Actions у небольшого репозитория срабатывают раз в
// несколько часов, а не каждый час, поэтому один вызов делает столько шагов
// плана, сколько влезает в бюджет времени (до maxSteps), потом рассылает письма
// и WhatsApp и, если сегодня ещё не было, шлёт владельцу сводку. Тот же тик
// вызывает и ежедневный крон Vercel — страховка на случай, когда GitHub молчит
// весь день. Два вызова подряд (два workflow, ручной перезапуск) не удваивают
// работу: второй тик в течение TICK_LOCK_MS отвечает `skipped: 'busy'`.

import { prisma } from '@specai/database';
import { onceADay } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import { DIGEST_HOURS, collectDigest, moscowHour } from './digest';
import { sendOutreach, type OutreachResult } from './outreachRun';
import { runScheduledStep, type ScheduledStepResult } from './run';
import { OVERPASS_TOTAL_MS } from './sources/osm';

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
  step?: (now: Date, budgetMs: number) => Promise<ScheduledStepResult>;
  outreach?: (now: Date, budgetMs: number) => Promise<OutreachResult>;
  sendDigest?: (now: Date) => Promise<boolean | null>;
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

async function defaultDigest(now: Date): Promise<boolean | null> {
  return onceADay('office-digest', async () => notifyTelegram(await collectDigest(now)), now);
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

  let digest = false;
  const hour = moscowHour(now);
  const inWindow = hour >= DIGEST_HOURS.from && hour <= DIGEST_HOURS.to;
  if (options.digest === 'any' || inWindow) {
    const sent = await (deps.sendDigest ?? defaultDigest)(now).catch((error: unknown) => {
      console.error('[office] digest failed', error);
      return null;
    });
    digest = sent === true;
  }
  return { steps, outreach, digest };
}
