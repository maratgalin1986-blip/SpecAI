import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_STATUS_OPTIONS,
  equipmentStatusLabel,
  isPublished,
  parsePrice,
  rowsFromSpecs,
  specsFromRows,
} from './equipmentEdit';

describe('equipment statuses for providers', () => {
  it('uses only the values of the database enum', () => {
    expect(EQUIPMENT_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      'AVAILABLE',
      'RENTED',
      'IN_MAINTENANCE',
      'RETIRED',
    ]);
    expect(equipmentStatusLabel('RETIRED')).toBe('Снята с публикации');
  });

  it('hides only RETIRED from customers', () => {
    expect(isPublished('AVAILABLE')).toBe(true);
    expect(isPublished('IN_MAINTENANCE')).toBe(true);
    expect(isPublished('RETIRED')).toBe(false);
  });
});

describe('spec rows', () => {
  it('turns rows into specs: drops empty rows, keeps numbers as numbers', () => {
    expect(
      specsFromRows([
        { key: 'Масса, кг', value: '20 300' },
        { key: 'Ковш, м³', value: '1,19' },
        { key: 'Двигатель', value: 'Cummins 6BT' },
        { key: '', value: 'без названия' },
        { key: 'Пусто', value: '  ' },
      ]),
    ).toEqual({ 'Масса, кг': 20300, 'Ковш, м³': 1.19, Двигатель: 'Cummins 6BT' });
    expect(specsFromRows([])).toBeUndefined();
  });

  it('turns specs back into rows and ignores nested values', () => {
    expect(rowsFromSpecs({ 'Масса, кг': 20300, Кабина: true, nested: { a: 1 } })).toEqual([
      { key: 'Масса, кг', value: '20300' },
      { key: 'Кабина', value: 'true' },
    ]);
    expect(rowsFromSpecs(null)).toEqual([]);
    expect(rowsFromSpecs([1, 2])).toEqual([]);
  });
});

describe('parsePrice', () => {
  it('reads a price field', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('2 500,5')).toBe(2500.5);
    expect(parsePrice('0')).toBeNaN();
    expect(parsePrice('abc')).toBeNaN();
  });
});
