import { describe, expect, it } from 'vitest';
import type { Category } from './api';
import { OTHER_GROUP, categorySections, popularCategories } from './categoryGroups';

const CATEGORIES: Category[] = [
  { id: 'exc', name: 'Экскаваторы гусеничные', group: 'Землеройная техника', popular: true },
  { id: 'mini', name: 'Мини-экскаваторы', group: 'Землеройная техника' },
  { id: 'cranes', name: 'Автокраны', group: 'Подъёмная техника', popular: true },
  { id: 'mixer', name: 'Автобетоносмесители (миксеры)', group: 'Бетон и растворы' },
  { id: 'custom', name: 'Своя категория' },
];

describe('popularCategories', () => {
  it('shows the flagged ones first and keeps the selected one visible', () => {
    expect(popularCategories(CATEGORIES).map((c) => c.id)).toEqual(['exc', 'cranes']);
    expect(popularCategories(CATEGORIES, 10, 'mixer').map((c) => c.id)).toEqual([
      'mixer',
      'exc',
      'cranes',
    ]);
    expect(popularCategories(CATEGORIES, 10, 'exc').map((c) => c.id)).toEqual(['exc', 'cranes']);
  });

  it('falls back to the first rows when the server sends no flags', () => {
    const flat = CATEGORIES.map(({ id, name }) => ({ id, name }));
    expect(popularCategories(flat, 3).map((c) => c.id)).toEqual(['exc', 'mini', 'cranes']);
  });
});

describe('categorySections', () => {
  it('groups rows in order of appearance, unknown ones under «Другая техника»', () => {
    const sections = categorySections(CATEGORIES);
    expect(sections.map((s) => s.title)).toEqual([
      'Землеройная техника',
      'Подъёмная техника',
      'Бетон и растворы',
      OTHER_GROUP,
    ]);
    expect(sections[0]!.data.map((c) => c.id)).toEqual(['exc', 'mini']);
  });

  it('filters by name or group, ignoring case and ё', () => {
    expect(categorySections(CATEGORIES, 'миксер')[0]!.data.map((c) => c.id)).toEqual(['mixer']);
    expect(categorySections(CATEGORIES, 'ПОДЪЕМНАЯ').map((s) => s.title)).toEqual([
      'Подъёмная техника',
    ]);
    expect(categorySections(CATEGORIES, 'вертолёт')).toEqual([]);
  });
});
