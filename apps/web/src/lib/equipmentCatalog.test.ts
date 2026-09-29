import { describe, expect, it } from 'vitest';
import {
  headlinePrices,
  keySpecs,
  machinePhotoOf,
  machineTypeOf,
  numericSpec,
  specChip,
  specEntries,
  taskGroupOf,
} from './equipmentCatalog';

describe('taskGroupOf', () => {
  it('groups catalog categories by task', () => {
    expect(taskGroupOf('Экскаваторы-погрузчики')).toBe('earth');
    expect(taskGroupOf('Бульдозеры')).toBe('earth');
    expect(taskGroupOf('Краны')).toBe('lifting');
    expect(taskGroupOf('Автовышки')).toBe('lifting');
    expect(taskGroupOf('Погрузчики')).toBe('loading');
    expect(taskGroupOf('Самосвалы')).toBe('transport');
    expect(taskGroupOf('Катки')).toBe('other');
  });
});

describe('machineTypeOf', () => {
  it('maps categories and names to a machine photo type', () => {
    expect(machineTypeOf('Экскаваторы-погрузчики')).toBe('backhoe');
    expect(machineTypeOf('Экскаваторы', 'JCB 4CX экскаватор-погрузчик')).toBe('backhoe');
    expect(machineTypeOf('Экскаваторы')).toBe('excavator');
    expect(machineTypeOf('Экскаваторы', 'Гусеничный экскаватор Hitachi')).toBe('excavator');
    expect(machineTypeOf('Экскаваторы', 'Колёсный экскаватор с гидромолотом')).toBe(
      'wheeled-excavator',
    );
    expect(machineTypeOf('Манипуляторы')).toBe('kmu');
    expect(machineTypeOf('Краны', 'Кран-манипулятор КМУ 7 т')).toBe('kmu');
    expect(machineTypeOf('Автовышки')).toBe('agp');
    expect(machineTypeOf('Спецтехника', 'АГП-22')).toBe('agp');
    expect(machineTypeOf('Катки')).toBe('roller');
    expect(machineTypeOf('Краны')).toBe('crane');
    expect(machineTypeOf('Погрузчики', 'Фронтальный погрузчик')).toBe('loader');
    expect(machineTypeOf('Погрузчики', 'Вилочный погрузчик')).toBeNull();
    expect(machineTypeOf('Самосвалы')).toBe('truck');
    expect(machineTypeOf('Бульдозеры')).toBe('dozer');
    expect(machineTypeOf('Тракторы')).toBe('tractor');
    expect(machineTypeOf('Генераторы')).toBeNull();
  });

  it('gives the server-rendered photo of the type', () => {
    expect(machinePhotoOf('Краны')).toMatch(/^\/images\/.+\.jpg$/);
    expect(machinePhotoOf('Генераторы')).toBeNull();
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
