import { describe, expect, it } from 'vitest';
import {
  EMPTY_RUNS,
  FAILING_RUNS,
  searchAlertText,
  searchHealth,
  type SearchRun,
} from './searchHealth';

const at = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
const run = (h: number, over: Partial<SearchRun> = {}): SearchRun => ({
  startedAt: at(h),
  finishedAt: at(h),
  error: null,
  found: 0,
  created: 0,
  ...over,
});
/** Через минуту после шага 13:00 — «сейчас» для старых проверок. */
const NOW = new Date(at(13).getTime() + 60_000);
const failed = (h: number) => run(h, { error: 'Источник карт не ответил' });

describe('searchHealth: жив ли поиск фирм', () => {
  it('шагов не было — idle', () => {
    expect(searchHealth([], NOW)).toEqual({
      search: 'idle',
      lastRunAt: null,
      failedInRow: 0,
      emptyInRow: 0,
      ageMinutes: null,
      lastFound: null,
      lastCreated: null,
      recent: [],
    });
  });

  it('последний шаг без ошибки — ok, с его числами; пустой шаг — тоже ok', () => {
    const health = searchHealth([run(12, { found: 72, created: 10 }), failed(9), failed(6)], NOW);
    expect(health).toMatchObject({
      search: 'ok',
      lastRunAt: at(12).toISOString(),
      failedInRow: 0,
      lastFound: 72,
      lastCreated: 10,
    });
    expect(health.recent.map((r) => [r.found, r.created, r.ok])).toEqual([
      [72, 10, true],
      [0, 0, false],
      [0, 0, false],
    ]);
    expect(searchHealth([run(12)], NOW).search).toBe('ok');
  });

  it('как на продакшене 9–10.11: шесть ошибок подряд — failing и строка для владельца', () => {
    const runs = [10, 7, 2, 1, -5, -10].map(failed);
    const health = searchHealth(runs, NOW);
    expect(health).toMatchObject({ search: 'failing', failedInRow: 6, lastFound: null });
    expect(searchAlertText(health, runs[0]!.error)).toBe(
      'Поиск фирм не работает — 6 шагов подряд с ошибкой: «Источник карт не ответил». Новых кандидатов нет.',
    );
  });

  it('одна-две ошибки — unstable, без тревоги; идущий сейчас шаг не считается', () => {
    const health = searchHealth(
      [run(13, { finishedAt: null }), failed(12), run(9, { found: 5, created: 2 })],
      NOW,
    );
    expect(health).toMatchObject({ search: 'unstable', failedInRow: 1, lastFound: 5 });
    expect(searchAlertText(health, 'x')).toBeNull();
    expect(FAILING_RUNS).toBe(3);
  });

  it('в ответе только слова и числа прогона — ни названий, ни телефонов', () => {
    const text = JSON.stringify(searchHealth([run(12, { found: 3, created: 1 })], NOW));
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      'ageMinutes',
      'emptyInRow',
      'failedInRow',
      'lastCreated',
      'lastFound',
      'lastRunAt',
      'recent',
      'search',
    ]);
  });

  it('как на продакшене 10.11: восемь ошибок, потом пустые шаги без ошибки — не «ok» навсегда', () => {
    const fails = [8, 7, 6, 5, 4, 3, 2, 1].map(failed);
    const first = searchHealth([run(9), ...fails], at(9));
    expect(first).toMatchObject({ search: 'ok', failedInRow: 0, emptyInRow: 1, lastCreated: 0 });
    expect(searchAlertText(first, null)).toBeNull();

    const empties = [14, 13, 12, 11, 10, 9].map((h) => run(h, { found: 40 }));
    const health = searchHealth([...empties, ...fails], at(14));
    expect(EMPTY_RUNS).toBe(6);
    expect(health).toMatchObject({ search: 'empty', emptyInRow: 6, failedInRow: 0 });
    expect(searchAlertText(health, null)).toBe(
      'Поиск работает, но 6 шагов подряд не дали ни одной новой фирмы.',
    );
    // Шаг с новой фирмой обрывает счёт.
    const revived = searchHealth([run(15, { found: 9, created: 1 }), ...empties], at(15));
    expect(revived).toMatchObject({ search: 'ok', emptyInRow: 0 });
  });

  it('ошибки подряд важнее пустых шагов', () => {
    const runs = [failed(12), failed(11), failed(10), ...[9, 8, 7, 6, 5, 4].map((h) => run(h))];
    expect(searchHealth(runs, NOW)).toMatchObject({ search: 'failing', emptyInRow: 0 });
  });

  it('шаг без отметки о конце старше 5 минут — функцию убили, это упавший шаг', () => {
    const hung = (h: number) => run(h, { finishedAt: null });
    const fresh = searchHealth([hung(13), run(12, { created: 2 })], NOW);
    expect(fresh).toMatchObject({ search: 'ok', failedInRow: 0, ageMinutes: 1 });

    const later = new Date(at(13).getTime() + 6 * 60_000);
    const killed = searchHealth([hung(13), hung(12), hung(11), run(10, { created: 2 })], later);
    expect(killed).toMatchObject({ search: 'failing', failedInRow: 3, lastCreated: 2 });
    expect(killed.recent[0]).toMatchObject({ ok: false });
  });

  it('поиск давно не запускался — строка о расписании, но не на паузе', () => {
    const health = searchHealth([run(0, { created: 3 })], at(13));
    expect(health).toMatchObject({ search: 'ok', ageMinutes: 13 * 60 });
    expect(searchAlertText(health, null)).toBe('Поиск не запускался 13 ч — проверьте расписание.');
    expect(searchAlertText(health, null, true)).toBeNull();
    expect(searchAlertText(searchHealth([run(0, { created: 3 })], at(12)), null)).toBeNull();
    expect(searchAlertText(searchHealth([], at(12)), null)).toBeNull();
  });
});
