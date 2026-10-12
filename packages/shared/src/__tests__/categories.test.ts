import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  POPULAR_CATEGORY_SLUGS,
  categoryByName,
  categoryEmoji,
  categoryGroupOf,
  categoryName,
  detectCategorySlug,
  groupCategoryRows,
} from '../categories';

describe('category tree', () => {
  it('has unique slugs and names across groups and categories', () => {
    const slugs = [...CATEGORY_GROUPS.map((g) => g.slug), ...CATEGORIES.map((c) => c.slug)];
    const names = [...CATEGORY_GROUPS.map((g) => g.name), ...CATEGORIES.map((c) => c.name)];
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it('keeps the slugs the site started with, each in an existing group', () => {
    const groups = new Set<string>(CATEGORY_GROUPS.map((g) => g.slug));
    for (const category of CATEGORIES) expect(groups.has(category.group)).toBe(true);
    for (const slug of [
      'excavators',
      'cranes',
      'bulldozers',
      'loaders',
      'dump-trucks',
      'backhoe-loaders',
      'crane-trucks',
      'aerial-platforms',
      'tractors',
      'rollers',
    ]) {
      expect(CATEGORIES.some((c) => c.slug === slug)).toBe(true);
    }
    for (const slug of POPULAR_CATEGORY_SLUGS) {
      expect(CATEGORIES.some((c) => c.slug === slug)).toBe(true);
    }
    expect(CATEGORY_GROUPS).toHaveLength(10);
  });

  it('uses url-safe slugs, non-empty emoji and keywords', () => {
    for (const category of CATEGORIES) {
      expect(category.slug).toMatch(/^[a-z0-9-]+$/);
      expect(category.emoji.length).toBeGreaterThan(0);
      expect(category.keywords.length).toBeGreaterThan(0);
    }
  });

  it('looks categories up by slug and by name', () => {
    expect(categoryName('cranes')).toBe('Автокраны');
    expect(categoryName('unknown')).toBe('unknown');
    expect(categoryByName('автокраны')?.slug).toBe('cranes');
    expect(categoryGroupOf({ slug: 'rollers' })?.slug).toBe('road');
    expect(categoryGroupOf({ name: 'Самосвалы' })?.name).toBe('Грузовой транспорт и перевозка');
    expect(categoryEmoji({ slug: 'generators' })).toBe('⚡');
    expect(categoryEmoji({ name: 'Что-то новое' })).toBeUndefined();
  });

  it('arranges rows by group in tree order, unknown ones last', () => {
    const groups = groupCategoryRows([
      { slug: 'rollers', name: 'Катки' },
      { slug: 'excavators', name: 'Экскаваторы гусеничные' },
      { slug: 'custom', name: 'Своя категория' },
      { slug: 'backhoe-loaders', name: 'Экскаваторы-погрузчики' },
    ]);
    expect(groups.map((g) => g.group.slug)).toEqual(['earthmoving', 'road', 'other']);
    expect(groups[0]!.categories.map((c) => c.slug)).toEqual(['excavators', 'backhoe-loaders']);
  });
});

describe('detectCategorySlug', () => {
  it.each([
    ['Нужен экскаватор-погрузчик JCB завтра', 'backhoe-loaders'],
    ['Нужен мини-экскаватор на дачу', 'mini-excavators'],
    ['Ищу колёсный экскаватор с гидромолотом', 'backhoe-loaders'],
    ['Нужен колёсный экскаватор', 'wheeled-excavators'],
    ['Требуется автокран 25 т', 'cranes'],
    ['Нужен манипулятор перевезти блок', 'crane-trucks'],
    ['Нужна бурильно-крановая машина', 'augers'],
    ['Нужен трал перевезти экскаватор 20 т', 'lowboys'],
    ['Ищу бобкэт убрать двор', 'skid-steers'],
    ['Нужен телескопический погрузчик 17 м', 'telehandlers'],
    ['Нужен вилочный погрузчик 3 т на склад', 'forklifts'],
    ['Нужен миксер 5 кубов', 'mixer-trucks'],
    ['Требуется бетононасос 32 м', 'concrete-pumps'],
    ['Нужен ямобур под сваи', 'augers'],
    ['Нужен илосос откачать септик', 'vacuum-trucks'],
    ['Требуется генератор 100 кВт', 'generators'],
    ['Нужен каток 10 т на асфальт', 'rollers'],
    ['Нужна раскатка теста', undefined],
    ['Всем привет', undefined],
  ])('«%s» → %s', (text, slug) => {
    expect(detectCategorySlug(text)).toBe(slug);
  });
});
