import { describe, expect, it } from 'vitest';
import { FAILING_RUNS, searchAlertText, searchHealth, type SearchRun } from './searchHealth';

const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
const run = (h: number, over: Partial<SearchRun> = {}): SearchRun => ({
  startedAt: at(h),
  finishedAt: at(h),
  error: null,
  found: 0,
  created: 0,
  ...over,
});
const failed = (h: number) => run(h, { error: 'Источник карт не ответил' });

describe('searchHealth: жив ли поиск фирм', () => {
  it('шагов не было — idle', () => {
    expect(searchHealth([])).toEqual({
      search: 'idle',
      lastRunAt: null,
      failedInRow: 0,
      lastFound: null,
      lastCreated: null,
    });
  });

  it('последний шаг без ошибки — ok, с его числами; пустой шаг — тоже ok', () => {
    const health = searchHealth([run(12, { found: 72, created: 10 }), failed(9), failed(6)]);
    expect(health).toEqual({
      search: 'ok',
      lastRunAt: at(12).toISOString(),
      failedInRow: 0,
      lastFound: 72,
      lastCreated: 10,
    });
    expect(searchHealth([run(12)]).search).toBe('ok');
  });

  it('как на продакшене 9–10.11: шесть ошибок подряд — failing и строка для владельца', () => {
    const runs = [10, 7, 2, 1, -5, -10].map(failed);
    const health = searchHealth(runs);
    expect(health).toMatchObject({ search: 'failing', failedInRow: 6, lastFound: null });
    expect(searchAlertText(health, runs[0]!.error)).toBe(
      'Поиск фирм не работает — 6 шагов подряд с ошибкой: «Источник карт не ответил». Новых кандидатов нет.',
    );
  });

  it('одна-две ошибки — unstable, без тревоги; идущий сейчас шаг не считается', () => {
    const health = searchHealth([
      run(13, { finishedAt: null }),
      failed(12),
      run(9, { found: 5, created: 2 }),
    ]);
    expect(health).toMatchObject({ search: 'unstable', failedInRow: 1, lastFound: 5 });
    expect(searchAlertText(health, 'x')).toBeNull();
    expect(FAILING_RUNS).toBe(3);
  });

  it('в ответе только слова и числа прогона — ни названий, ни телефонов', () => {
    const text = JSON.stringify(searchHealth([run(12, { found: 3, created: 1 })]));
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      'failedInRow',
      'lastCreated',
      'lastFound',
      'lastRunAt',
      'search',
    ]);
  });
});
