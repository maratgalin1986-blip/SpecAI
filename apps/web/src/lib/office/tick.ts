// Один «тик» офиса — общая работа для любого планировщика (lib/office, spec § 7).
//
// Расписания GitHub Actions у небольшого репозитория срабатывают раз в
// несколько часов, а не каждый час или пять минут, поэтому один вызов делает
// столько шагов плана, сколько влезает в бюджет времени (до maxSteps), потом
// рассылает письма и WhatsApp и, если сегодня ещё не было, шлёт владельцу
// сводку. Тот же тик вызывает и ежедневный крон Vercel — страховка на случай,
// когда GitHub молчит весь день.

import { onceADay } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import { DIGEST_HOURS, collectDigest, moscowHour } from './digest';
import { sendOutreach, type OutreachResult } from './outreachRun';
import { runScheduledStep, type ScheduledStepResult } from './run';

export interface TickOptions {
  /** Сколько миллисекунд есть у всего тика (функция Vercel живёт 60 с). */
  budgetMs: number;
  /** Не больше стольких шагов плана за один тик. */
  maxSteps: number;
  /**
   * `window` — сводка только в утреннее окно DIGEST_HOURS (ежечасный вызов);
   * `any` — в любое время, если сегодня ещё не было (дневной крон-страховка).
   */
  digest: 'window' | 'any';
}

export interface TickDeps {
  step?: (now: Date) => Promise<ScheduledStepResult>;
  outreach?: (now: Date, budgetMs: number) => Promise<OutreachResult>;
  sendDigest?: (now: Date) => Promise<boolean | null>;
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

export interface TickResult {
  steps: TickStep[];
  outreach: OutreachResult | { skipped: 'no-time' };
  digest: boolean;
}

/** Сколько времени оставить рассылке и сводке после шагов поиска. */
export const TICK_RESERVE_MS = 15_000;
/** Шаг поиска не начинается, если до резерва осталось меньше этого. */
export const STEP_MIN_MS = 12_000;

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
  const runStep = deps.step ?? ((at: Date) => runScheduledStep(at));
  const steps: TickStep[] = [];

  for (let i = 0; i < Math.max(0, options.maxSteps); i++) {
    if (left() - TICK_RESERVE_MS < STEP_MIN_MS) break;
    const result = await runStep(new Date()).catch((error: unknown) => {
      console.error('[office] step failed', error);
      return { skipped: 'error' as const, step: null, result: null } as ScheduledStepResult;
    });
    steps.push(publicStep(result));
    // На паузе, пустой план или ошибка источника — дальше шаги не нужны.
    if (result.skipped || result.result.error) break;
  }

  const outreachBudget = left() - 5_000;
  const outreach =
    outreachBudget > 2_000
      ? await (deps.outreach ?? ((at, budget) => sendOutreach(at, { budgetMs: budget })))(
          now,
          outreachBudget,
        ).catch((error: unknown) => {
          console.error('[office] outreach failed', error);
          return { email: 0, whatsapp: 0, skipped: 'error', errors: 0 } as OutreachResult;
        })
      : ({ skipped: 'no-time' } as const);

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
