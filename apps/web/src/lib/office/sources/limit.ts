// Общий лимит ответа источника: `limit` считает только фирмы без сайта — кандидатов.
// Фирмы с сайтом остаются в ответе без обрезки: досье считает по ним конкурентов рядом
// и сколько из них с сайтом, а прогон всё равно не делает их кандидатами.

import type { Candidate } from './types';

export function capWithoutSite(candidates: readonly Candidate[], limit: number): Candidate[] {
  const max = Math.max(0, limit);
  let kept = 0;
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (c.website) out.push(c);
    else if (kept < max) {
      out.push(c);
      kept++;
    }
  }
  return out;
}

export function countWithoutSite(candidates: readonly Candidate[]): number {
  return candidates.reduce((n, c) => n + (c.website ? 0 : 1), 0);
}
