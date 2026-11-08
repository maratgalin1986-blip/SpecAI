/**
 * Вид техники по словам: поиск в списке «Все виды техники» и вид, который
 * называет текст заявки. Слова приходят из GET /api/categories (keywords,
 * searchWords, priority — packages/shared/src/categories.ts); приложение не
 * тянет общий пакет, поэтому правило повторено здесь и сверяется с общим в
 * apps/web/src/lib/categorySearch.test.ts. Без импортов — модуль чистый.
 */

/** Поля вида техники, которые нужны поиску (Category из lib/api). */
export interface WordedCategory {
  name: string;
  group?: string | null;
  keywords?: string[];
  searchWords?: string[];
  priority?: number;
}

export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Подходит ли вид под строку поиска: по названию, группе и словам с сервера
 * («манипулятор», «jcb», «вездеход»); слово-основа из списка тоже узнаётся в
 * начале введённого («экскаватора»).
 */
export function matchesSearch(category: WordedCategory, needle: string): boolean {
  if (!needle) return true;
  const words = [...(category.keywords ?? []), ...(category.searchWords ?? [])].map(
    normalizeSearch,
  );
  const haystack = normalizeSearch([category.name, category.group ?? '', ...words].join(' | '));
  if (haystack.includes(needle)) return true;
  return (category.keywords ?? [])
    .map(normalizeSearch)
    .some((stem) => stem.length >= 3 && needle.startsWith(stem));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Вид техники, который называет текст заявки («Манипулятор вездеход» →
 * «Краны-манипуляторы (КМУ)»): то же правило, что detectCategory в
 * packages/shared/src/categories.ts (слово с начала, выше вес, затем длиннее
 * совпадение, затем порядок списка), по словам из GET /api/categories.
 * Проверяется против общего правила в apps/web/src/lib/categorySearch.test.ts.
 */
export function detectCategoryFromText<T extends WordedCategory>(
  text: string,
  categories: readonly T[],
): T | null {
  const normalized = normalizeSearch(text);
  if (!normalized) return null;
  let best: { category: T; priority: number; length: number } | null = null;
  for (const category of categories) {
    const keywords = (category.keywords ?? []).map(normalizeSearch).filter(Boolean);
    if (keywords.length === 0) continue;
    const pattern = new RegExp(`(^|[^a-zа-я0-9])(?:${keywords.map(escapeRegExp).join('|')})`);
    const match = pattern.exec(normalized);
    if (!match) continue;
    const candidate = {
      category,
      priority: category.priority ?? 0,
      length: match[0].length - (match[1] ?? '').length,
    };
    if (
      !best ||
      candidate.priority > best.priority ||
      (candidate.priority === best.priority && candidate.length > best.length)
    ) {
      best = candidate;
    }
  }
  return best?.category ?? null;
}
