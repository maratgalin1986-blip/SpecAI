/**
 * Чистая логика выбора вида техники: какие плитки показать первыми и как
 * разложить полный список по группам для шторки «Все виды техники».
 * Категории приходят из GET /api/categories уже в порядке дерева
 * (packages/shared/src/categories.ts); без полей `group`/`popular` (старый
 * сервер) всё работает как плоский список. Покрыто тестами.
 */
import type { Category } from '@/lib/api';

export const OTHER_GROUP = 'Другая техника';

export interface CategorySection {
  title: string;
  data: Category[];
}

/**
 * Плитки быстрого заказа: виды с флагом `popular` (десять самых частых),
 * а без флагов — первые `limit`. Выбранный вид, которого среди них нет,
 * ставится первым, чтобы выбор было видно.
 */
export function popularCategories(
  categories: Category[],
  limit = 10,
  selectedId?: string | null,
): Category[] {
  const flagged = categories.filter((category) => category.popular);
  const base = (flagged.length > 0 ? flagged : categories).slice(0, limit);
  if (selectedId && !base.some((category) => category.id === selectedId)) {
    const selected = categories.find((category) => category.id === selectedId);
    if (selected) return [selected, ...base];
  }
  return base;
}

export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Разделы для SectionList: по группе в порядке появления; категории без
 * группы — в «Другая техника». Поиск — по названию вида и группы.
 */
export function categorySections(categories: Category[], query = ''): CategorySection[] {
  const needle = normalizeSearch(query);
  const sections: CategorySection[] = [];
  const byTitle = new Map<string, CategorySection>();
  for (const category of categories) {
    if (needle && !normalizeSearch(`${category.name} ${category.group ?? ''}`).includes(needle)) {
      continue;
    }
    const title = category.group ?? OTHER_GROUP;
    let section = byTitle.get(title);
    if (!section) {
      section = { title, data: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.data.push(category);
  }
  return sections;
}
