// Finding a machinery type from what a person types: the order forms' search
// box («манипулятор», «jcb», «вездеход») and the machinery named in «Что
// нужно». Both use the shared catalogue (packages/shared/src/categories.ts):
// its keywords, its search-only words and its detectCategory. Pure, so the
// forms, the API routes and the tests share it.

import {
  categoryBySlug,
  categoryGroupBySlug,
  detectCategory,
  normalizeKeywordText,
} from '@specai/shared';

export interface SearchableCategory {
  id: string;
  name: string;
  slug?: string | null;
}

// «Для исполнителя «Кран-Сервис». …» (an order from a provider's card): the
// company's name says nothing about the machinery the customer needs.
const PROVIDER_PREFIX = /^\s*Для исполнителя «[^»]*»\.?\s*/;

/** The part of an order's description that speaks about the job. */
export function detectionText(description: string): string {
  return description.replace(PROVIDER_PREFIX, '');
}

/** The catalogue slug of the machinery an order's description names, if any. */
export function detectOrderCategorySlug(description: string): string | undefined {
  return detectCategory(detectionText(description))?.slug;
}

/** The row of the machinery an order's description names, among `rows`. */
export function detectCategoryRow<T extends SearchableCategory>(
  description: string,
  rows: readonly T[],
): T | undefined {
  const slug = detectOrderCategorySlug(description);
  return slug ? rows.find((row) => row.slug === slug) : undefined;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether `token` starts a word somewhere in `haystack` (both normalised). */
function startsAWord(haystack: string, token: string): boolean {
  return new RegExp(`(?<![a-zа-я0-9])${escapeRegExp(token)}`).test(haystack);
}

/**
 * The rows that match a search box, best first: the category the text names
 * (detectCategory) leads, then the rows with more matching words — a word
 * matches when it starts a word of the name, the group, a keyword or a search
 * word («мани» finds «Краны-манипуляторы»), or when a keyword stem starts it
 * («экскаватора»). An empty query returns every row in its order.
 */
export function searchCategories<T extends SearchableCategory>(
  query: string,
  rows: readonly T[],
): T[] {
  const normalized = normalizeKeywordText(query);
  const tokens = normalized.split(/[\s,.;:!?()«»"]+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return [...rows];
  const detected = detectCategory(normalized)?.slug;
  return rows
    .map((row, index) => {
      const def = categoryBySlug(row.slug);
      const group = def ? (categoryGroupBySlug(def.group)?.name ?? '') : '';
      const name = normalizeKeywordText(row.name);
      const haystack = normalizeKeywordText(
        [row.name, group, ...(def?.keywords ?? []), ...(def?.searchWords ?? [])].join(' | '),
      );
      const stems = (def?.keywords ?? []).map(normalizeKeywordText).filter((s) => s.length >= 3);
      let hits = 0;
      for (const token of tokens) {
        if (startsAWord(haystack, token) || stems.some((stem) => token.startsWith(stem))) hits += 1;
      }
      let score = hits * 10;
      if (hits > 0 && startsAWord(name, tokens[0]!)) score += 5;
      if (detected && row.slug === detected) score += 100;
      return { row, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.row);
}
