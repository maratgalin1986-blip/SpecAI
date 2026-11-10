// Жив ли поиск фирм — по журналу прогонов (OfficeRun). Урок 9–10.11.2026: шесть шагов подряд
// закончились «Источник карт не ответил», кандидатов было ноль, и об этом никто не узнал, пока
// владелец не открыл журнал. Теперь состояние видно снаружи (GET /api/health — только слова и
// числа прогона, без имён и телефонов), в шапке /admin/office и в утренней сводке.

export interface SearchRun {
  agent?: string;
  niche?: string;
  city?: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  found: number;
  created: number;
}

export interface SearchHealth {
  /**
   * `ok` — последний законченный шаг прошёл без ошибки; `failing` — FAILING_RUNS и больше
   * последних шагов подряд с ошибкой; `empty` — EMPTY_RUNS и больше последних шагов подряд
   * без ошибки, но и без единой новой фирмы; `unstable` — последний с ошибкой, но ещё не
   * подряд; `idle` — шагов не было.
   */
  search: 'ok' | 'unstable' | 'failing' | 'empty' | 'idle';
  /** Когда начался последний законченный шаг, ISO; null — шагов не было. */
  lastRunAt: string | null;
  /** Сколько последних законченных шагов подряд закончились ошибкой. */
  failedInRow: number;
  /** Сколько последних законченных шагов подряд прошли без ошибки и не создали ни одной фирмы. */
  emptyInRow: number;
  /** Сколько минут назад начался самый свежий шаг (в том числе идущий); null — шагов не было. */
  ageMinutes: number | null;
  /** Сколько фирм нашёл и сколько кандидатов создал последний шаг без ошибки. */
  lastFound: number | null;
  lastCreated: number | null;
  /** Последние законченные шаги, новые первыми: что искали и сколько нашли (без текста ошибки). */
  recent: {
    at: string;
    agent: string;
    niche: string;
    city: string;
    found: number;
    created: number;
    ok: boolean;
  }[];
}

/** Сколько последних шагов показывать в `recent`. */
export const RECENT_RUNS = 6;

/** Столько ошибок подряд — уже не случайность: источник не работает. */
export const FAILING_RUNS = 3;
/** Столько шагов подряд без ошибки и без новых фирм — поиск крутится вхолостую. */
export const EMPTY_RUNS = 6;
/** Шаг без отметки о конце старше этого — функцию убили, считаем его упавшим. */
export const KILLED_AFTER_MS = 5 * 60_000;
/** Столько часов без единого шага (и не на паузе) — расписание не срабатывает. */
export const STALE_HOURS = 12;
/** Сколько последних шагов читать из журнала. */
export const SEARCH_HEALTH_RUNS = 10;

/**
 * `runs` — последние шаги, новые первыми. Незаконченный шаг моложе KILLED_AFTER_MS идёт сейчас
 * и не считается; старше — функцию убили, это упавший шаг.
 */
export function searchHealth(runs: readonly SearchRun[], now: Date): SearchHealth {
  const newest = runs.reduce<Date | null>(
    (max, r) => (max === null || r.startedAt > max ? r.startedAt : max),
    null,
  );
  const ageMinutes =
    newest === null ? null : Math.max(0, Math.floor((now.getTime() - newest.getTime()) / 60_000));
  const done = runs
    .filter((r) => r.finishedAt !== null || now.getTime() - r.startedAt.getTime() > KILLED_AFTER_MS)
    .map((r) => ({ ...r, ok: r.finishedAt !== null && !r.error }));
  const last = done[0];
  if (!last) {
    return {
      search: 'idle',
      lastRunAt: null,
      failedInRow: 0,
      emptyInRow: 0,
      ageMinutes,
      lastFound: null,
      lastCreated: null,
      recent: [],
    };
  }
  let failedInRow = 0;
  for (const run of done) {
    if (run.ok) break;
    failedInRow += 1;
  }
  let emptyInRow = 0;
  for (const run of done) {
    if (!run.ok || run.created > 0) break;
    emptyInRow += 1;
  }
  const good = done.find((r) => r.ok);
  const search =
    failedInRow >= FAILING_RUNS
      ? 'failing'
      : emptyInRow >= EMPTY_RUNS
        ? 'empty'
        : failedInRow > 0
          ? 'unstable'
          : 'ok';
  return {
    search,
    lastRunAt: last.startedAt.toISOString(),
    failedInRow,
    emptyInRow,
    ageMinutes,
    lastFound: good ? good.found : null,
    lastCreated: good ? good.created : null,
    recent: done.slice(0, RECENT_RUNS).map((r) => ({
      at: r.startedAt.toISOString(),
      agent: r.agent ?? '',
      niche: r.niche ?? '',
      city: r.city ?? '',
      found: r.found,
      created: r.created,
      ok: r.ok,
    })),
  };
}

/**
 * Строка для шапки админки и сводки; null — поиск в порядке или ещё не запускался.
 * `paused` — поиск остановлен владельцем: тогда долгое молчание не тревога.
 */
export function searchAlertText(
  health: SearchHealth,
  lastError: string | null,
  paused = false,
): string | null {
  if (health.search === 'failing') {
    const reason = lastError?.trim() ? `: «${lastError.trim()}»` : '';
    return `Поиск фирм не работает — ${health.failedInRow} шагов подряд с ошибкой${reason}. Новых кандидатов нет.`;
  }
  if (!paused && health.ageMinutes !== null && health.ageMinutes > STALE_HOURS * 60) {
    return `Поиск не запускался ${Math.floor(health.ageMinutes / 60)} ч — проверьте расписание.`;
  }
  if (health.search === 'empty') {
    return `Поиск работает, но ${health.emptyInRow} шагов подряд не дали ни одной новой фирмы.`;
  }
  return null;
}
