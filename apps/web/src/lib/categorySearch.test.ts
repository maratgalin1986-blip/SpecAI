import { describe, expect, it } from 'vitest';
import { CATEGORIES, detectCategorySlug } from '@specai/shared';
import * as APP from '../../../mobile/src/lib/categoryText';
import {
  detectCategoryRow,
  detectOrderCategorySlug,
  detectionText,
  searchCategories,
} from './categorySearch';

// The rows as GET /api/categories gives them (ids are cuids there).
const ROWS = CATEGORIES.map((category) => ({
  id: `id-${category.slug}`,
  name: category.name,
  slug: category.slug,
}));

const top = (query: string) => searchCategories(query, ROWS)[0]?.slug;
const found = (query: string) => searchCategories(query, ROWS).map((row) => row.slug);

describe('detectCategoryRow', () => {
  it('«Манипулятор вездеход» is a crane truck (the owner, 2026-10-18)', () => {
    expect(detectCategoryRow('Манипулятор вездеход', ROWS)?.name).toBe('Краны-манипуляторы (КМУ)');
  });

  it('ignores the provider named at the start of an order from its card', () => {
    const text = 'Для исполнителя «Кран-Сервис». Нужен самосвал вывезти грунт';
    expect(detectionText(text)).toBe('Нужен самосвал вывезти грунт');
    expect(detectOrderCategorySlug(text)).toBe('dump-trucks');
    expect(detectOrderCategorySlug('Для исполнителя «Манипулятор16». Привет')).toBeUndefined();
  });

  it('finds nothing in a text without machinery, or a row the list does not have', () => {
    expect(detectCategoryRow('Нужно выкопать яму', ROWS)).toBeUndefined();
    expect(detectCategoryRow('Нужен манипулятор', [{ id: 'x', name: 'Своя', slug: null }])).toBe(
      undefined,
    );
  });
});

describe('searchCategories', () => {
  it.each([
    ['манипулятор', 'crane-trucks'],
    ['Манипулятор вездеход', 'crane-trucks'],
    ['вездеход', 'crane-trucks'],
    ['кму', 'crane-trucks'],
    ['КМУ', 'crane-trucks'],
    ['самогруз', 'crane-trucks'],
    ['мани', 'crane-trucks'],
    ['экскаватор-погрузчик', 'backhoe-loaders'],
    ['jcb', 'backhoe-loaders'],
    ['JCB 3CX', 'backhoe-loaders'],
    ['ямобур', 'augers'],
    ['трал', 'lowboys'],
    ['вышка', 'aerial-platforms'],
    ['кран', 'cranes'],
    ['самосвал', 'dump-trucks'],
    ['экскаватора', 'excavators'],
  ])('«%s» → %s first', (query, slug) => {
    expect(top(query)).toBe(slug);
  });

  it('lists every crane for «кран», the truck cranes among them', () => {
    expect(found('кран')).toEqual(
      expect.arrayContaining(['cranes', 'crane-trucks', 'tower-cranes', 'crawler-cranes']),
    );
  });

  it('finds by group name too', () => {
    expect(found('подъёмная')).toContain('crane-trucks');
  });

  it('returns every row for an empty query and none for nonsense', () => {
    expect(searchCategories('  ', ROWS)).toHaveLength(ROWS.length);
    expect(searchCategories('qwxz', ROWS)).toEqual([]);
  });

  it('works with rows outside the catalogue by their name', () => {
    expect(searchCategories('своя', [{ id: 'x', name: 'Своя техника' }])).toHaveLength(1);
  });
});

// The app cannot import the shared package: it gets the keywords from
// GET /api/categories and runs its own copy of the rule. Both must agree.
describe('the app finds the same machinery as the site', () => {
  const apiRows = CATEGORIES.map((category) => ({
    id: `id-${category.slug}`,
    name: category.name,
    slug: category.slug,
    keywords: category.keywords,
    searchWords: category.searchWords ?? [],
    priority: category.priority ?? 0,
  }));

  it.each([
    'Манипулятор вездеход',
    'Нужен самогруз привезти блоки',
    'Нужен экскаватор-погрузчик JCB завтра',
    'Нужен трал перевезти экскаватор 20 т',
    'Нужен колёсный экскаватор',
    'Ищу колёсный экскаватор с гидромолотом',
    'Требуется автокран 25 т',
    'Нужен кран-манипулятор',
    'Нужна бурильно-крановая машина',
    'Нужен мини-экскаватор на дачу',
    'нужна автовышка 22 м',
    'Нужен самосвал вывезти грунт после экскаватора',
    'Нужен вездеход',
    'Всем привет',
  ])('«%s»', (text) => {
    expect(APP.detectCategoryFromText(text, apiRows)?.slug).toBe(detectCategorySlug(text));
  });

  it('finds a type in the app list by the words the site uses', () => {
    const found = (query: string) =>
      apiRows
        .filter((row) => APP.matchesSearch(row, APP.normalizeSearch(query)))
        .map((r) => r.slug);
    expect(found('вездеход')).toContain('crane-trucks');
    expect(found('самогруз')).toContain('crane-trucks');
    expect(found('jcb')).toContain('backhoe-loaders');
    expect(found('экскаватор-погрузчик')).toContain('backhoe-loaders');
    expect(found('вышка')).toContain('aerial-platforms');
  });
});
