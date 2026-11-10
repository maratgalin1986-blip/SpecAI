// Несколько источников по очереди: первый ответивший «ok» с кандидатами
// побеждает; «ok» без кандидатов или «unavailable» — пробуем следующий.
// Так 2ГИС (когда есть ключ) идёт первым, OSM — запасным, и шаг не пустеет,
// если один из них молчит. Для двух сервисов одних и тех же данных — firstAvailable.

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
        // Источники отдают и фирмы с сайтом (для досье): побеждает ответ, где есть кого
        // сделать кандидатом, — иначе спрашиваем следующий источник.
        if (result.status === 'ok' && result.candidates.some((c) => !c.website)) return result;
        // Пустой «ok» или отказ запоминаем: если лучше никто не ответит, вернём его. Ответ «ok»
        // (источник жив, новых фирм нет) отказом следующего источника не заменяется: иначе
        // пустой шаг записался бы ошибкой «не ответил», и тик бросил бы остальные шаги.
        if (result.status === 'ok' || last.status !== 'ok') last = result;
      }
      return last;
    },
  };
}

/**
 * Один и тот же набор данных через разные сервисы (Nominatim и Overpass — оба OpenStreetMap):
 * отвечает первый доступный, даже если фирм нет. Следующий спрашивается только при отказе —
 * второй сервис тех же данных ничего нового не найдёт, а молчащий Overpass съел бы время шага.
 */
export function firstAvailable(sources: readonly ProspectSource[]): ProspectSource {
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
        if (result.status === 'ok') return result;
        last = result;
      }
      return last;
    },
  };
}
