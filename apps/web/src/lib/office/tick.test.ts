import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn(async () => true) }));

import {
  STEP_MIN_MS,
  TICK_LOCK_MS,
  TICK_RESERVE_MS,
  officeTick,
  tickLockKey,
  type TickDeps,
} from './tick';
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
