import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@specai/shared';
import {
  TASK_GROUPS,
  headlinePrices,
  keySpecs,
  machinePhotoOf,
  machineTypeOf,
  normalizeTaskGroupId,
  numericSpec,
  specChip,
  specEntries,
  taskGroupOf,
} from './equipmentCatalog';

describe('taskGroupOf', () => {
  it('groups catalog categories by task, by slug or exact name', () => {
    expect(taskGroupOf('Экскаваторы-погрузчики')).toBe('earthmoving');
    expect(taskGroupOf('Бульдозеры')).toBe('earthmoving');
    expect(taskGroupOf('Автокраны')).toBe('lifting');
    expect(taskGroupOf('Автовышки (АГП)')).toBe('lifting');
    expect(taskGroupOf('Фронтальные погрузчики')).toBe('loading');
    expect(taskGroupOf('Самосвалы')).toBe('hauling');
    expect(taskGroupOf('Катки')).toBe('road');
    expect(taskGroupOf('Что угодно', 'mixer-trucks')).toBe('concrete');
    expect(taskGroupOf('Дизельные генераторы')).toBe('equipment');
  });

  it('guesses the group of a hand-made category and knows every shared group', () => {
    expect(taskGroupOf('Краны')).toBe('lifting');
    expect(taskGroupOf('Погрузчики')).toBe('loading');
    expect(taskGroupOf('Пилорамы')).toBe('other');
    const ids = new Set<string>(TASK_GROUPS.map((group) => group.id));
    for (const category of CATEGORIES) expect(ids.has(category.group)).toBe(true);
  });

  it('understands the group ids of older catalog links', () => {
    expect(normalizeTaskGroupId('earth')).toBe('earthmoving');
    expect(normalizeTaskGroupId('transport')).toBe('hauling');
    expect(normalizeTaskGroupId('road')).toBe('road');
    expect(normalizeTaskGroupId('nope')).toBeUndefined();
  });
});

describe('machineTypeOf', () => {
  it('maps categories and names to a machine photo type', () => {
    expect(machineTypeOf('Экскаваторы-погрузчики')).toBe('backhoe');
    expect(machineTypeOf('Экскаваторы гусеничные', 'JCB 4CX экскаватор-погрузчик')).toBe('backhoe');
    expect(machineTypeOf('Экскаваторы гусеничные')).toBe('excavator');
    expect(machineTypeOf('Экскаваторы гусеничные', 'Гусеничный экскаватор Hitachi')).toBe(
      'excavator',
    );
    expect(machineTypeOf('Экскаваторы гусеничные', 'Колёсный экскаватор с гидромолотом')).toBe(
      'wheeled-excavator',
    );
    expect(machineTypeOf('Экскаваторы колёсные')).toBe('wheeled-excavator');
    expect(machineTypeOf('Мини-экскаваторы')).toBe('excavator');
    expect(machineTypeOf('Краны-манипуляторы (КМУ)')).toBe('kmu');
    expect(machineTypeOf('Автокраны', 'Кран-манипулятор КМУ 7 т')).toBe('kmu');
    expect(machineTypeOf('Автовышки (АГП)')).toBe('agp');
    expect(machineTypeOf('Спецтехника', 'АГП-22')).toBe('agp');
    expect(machineTypeOf('Катки')).toBe('roller');
    expect(machineTypeOf('Автокраны')).toBe('crane');
    expect(machineTypeOf('Фронтальные погрузчики', 'Фронтальный погрузчик')).toBe('loader');
    expect(machineTypeOf('Вилочные погрузчики')).toBeNull();
    expect(machineTypeOf('Телескопические погрузчики')).toBeNull();
    expect(machineTypeOf('Мини-погрузчики (бобкэт)')).toBeNull();
    expect(machineTypeOf('Ножничные и коленчатые подъёмники')).toBeNull();
    expect(machineTypeOf('Самосвалы')).toBe('truck');
    expect(machineTypeOf('Тралы и низкорамники')).toBe('truck');
    expect(machineTypeOf('Бульдозеры')).toBe('dozer');
    expect(machineTypeOf('Тракторы')).toBe('tractor');
    expect(machineTypeOf('Дизельные генераторы')).toBeNull();
  });

  it('still reads the older category names', () => {
    expect(machineTypeOf('Экскаваторы')).toBe('excavator');
    expect(machineTypeOf('Краны')).toBe('crane');
    expect(machineTypeOf('Манипуляторы')).toBe('kmu');
    expect(machineTypeOf('Погрузчики', 'Вилочный погрузчик')).toBeNull();
    expect(machineTypeOf('Генераторы')).toBeNull();
  });

  it('never throws for any category of the shared list', () => {
    for (const category of CATEGORIES) {
      expect(() => machineTypeOf(category.name)).not.toThrow();
    }
  });

  it('gives the server-rendered photo of the type', () => {
    expect(machinePhotoOf('Автокраны')).toMatch(/^\/images\/.+\.jpg$/);
    expect(machinePhotoOf('Дизельные генераторы')).toBeNull();
  });
});

describe('specs', () => {
  const specs = {
    'Грузоподъёмность, т': 32,
    'Цена с гидромолотом, ₽/ч': 3500,
    'Навесное оборудование': 'ковш, гидромолот',
    'Макс. глубина копания, м': 5.9,
    nested: { a: 1 },
    empty: '',
  };

  it('splits labels and units and skips non-scalars', () => {
    const rows = specEntries(specs);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ label: 'Грузоподъёмность', unit: 'т', value: '32' });
    expect(rows[2]).toMatchObject({ label: 'Навесное оборудование', unit: '' });
  });

  it('keeps prices out of chips', () => {
    expect(keySpecs(specs).map(specChip)).toEqual([
      'Грузоподъёмность 32 т',
      'Навесное оборудование: ковш, гидромолот',
      'Макс. глубина копания 5,9 м',
    ]);
  });

  it('reads numeric specs by pattern', () => {
    expect(numericSpec(specs, /глубина копания/i)).toBe(5.9);
    expect(numericSpec(specs, /радиус/i)).toBeNull();
    expect(numericSpec(null, /x/)).toBeNull();
  });
});

describe('headlinePrices', () => {
  it('uses the daily rate as the shift price and falls back to 8 hours', () => {
    expect(headlinePrices({ hourlyRate: '3000.00', dailyRate: '24000.00' })).toEqual({
      hour: 3000,
      shift: 24000,
    });
    expect(headlinePrices({ hourlyRate: 3500, dailyRate: null })).toEqual({
      hour: 3500,
      shift: 28000,
    });
    expect(headlinePrices({ hourlyRate: null, dailyRate: 22000 })).toEqual({
      hour: null,
      shift: 22000,
    });
  });
});
