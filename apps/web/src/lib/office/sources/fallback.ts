// Несколько источников по очереди: первый ответивший «ok» с кандидатами
// побеждает; «ok» без кандидатов или «unavailable» — пробуем следующий.
// Так 2ГИС (когда есть ключ) идёт первым, OSM — запасным, и шаг не пустеет,
// если один из них молчит.

import type { ProspectSource, SearchResult } from './types';

export function withFallback(sources: readonly ProspectSource[]): ProspectSource {
  const list = sources.filter(Boolean);
  const first = list[0];
  if (!first) throw new Error('Нужен хотя бы один источник кандидатов');
  if (list.length === 1) return first;
  return {
    id: list.map((s) => s.id).join('+'),
    async search(input) {
      let last: SearchResult = { status: 'unavailable', error: 'Источники не ответили' };
      const startedAt = Date.now();
      for (const source of list) {
        const left =
          input.budgetMs === undefined ? undefined : input.budgetMs - (Date.now() - startedAt);
        if (left !== undefined && left < 2_000) break;
        const result = await source.search(
          left === undefined ? input : { ...input, budgetMs: left },
        );
        if (result.status === 'ok' && result.candidates.length > 0) return result;
        // Пустой «ok» или отказ запоминаем: если лучше никто не ответит, вернём его.
        last = result;
      }
      return last;
    },
  };
}
