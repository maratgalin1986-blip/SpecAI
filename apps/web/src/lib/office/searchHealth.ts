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
   * последних шагов подряд с ошибкой; `unstable` — последний с ошибкой, но ещё не подряд;
   * `idle` — шагов не было.
   */
  search: 'ok' | 'unstable' | 'failing' | 'idle';
  /** Когда начался последний законченный шаг, ISO; null — шагов не было. */
  lastRunAt: string | null;
  /** Сколько последних законченных шагов подряд закончились ошибкой. */
  failedInRow: number;
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
/** Сколько последних шагов читать из журнала. */
export const SEARCH_HEALTH_RUNS = 10;

/** `runs` — последние шаги, новые первыми; незаконченные (идут сейчас) не считаются. */
export function searchHealth(runs: readonly SearchRun[]): SearchHealth {
  const done = runs.filter((r) => r.finishedAt !== null);
  const last = done[0];
  if (!last) {
    return {
      search: 'idle',
      lastRunAt: null,
      failedInRow: 0,
      lastFound: null,
      lastCreated: null,
      recent: [],
    };
  }
  let failedInRow = 0;
  for (const run of done) {
    if (!run.error) break;
    failedInRow += 1;
  }
  const good = done.find((r) => !r.error);
  return {
    search: failedInRow === 0 ? 'ok' : failedInRow >= FAILING_RUNS ? 'failing' : 'unstable',
    lastRunAt: last.startedAt.toISOString(),
    failedInRow,
    lastFound: good ? good.found : null,
    lastCreated: good ? good.created : null,
    recent: done.slice(0, RECENT_RUNS).map((r) => ({
      at: r.startedAt.toISOString(),
      agent: r.agent ?? '',
      niche: r.niche ?? '',
      city: r.city ?? '',
      found: r.found,
      created: r.created,
      ok: !r.error,
    })),
  };
}

/** Строка для шапки админки и сводки; null — поиск в порядке или ещё не запускался. */
export function searchAlertText(health: SearchHealth, lastError: string | null): string | null {
  if (health.search !== 'failing') return null;
  const reason = lastError?.trim() ? `: «${lastError.trim()}»` : '';
  return `Поиск фирм не работает — ${health.failedInRow} шагов подряд с ошибкой${reason}. Новых кандидатов нет.`;
}
