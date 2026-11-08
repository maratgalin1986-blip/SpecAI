import { describe, expect, it } from 'vitest';
import { namesPlace, namesTown } from './addressVariants';

describe('namesTown and namesPlace', () => {
  it('takes a word followed by a bare house number for a street, not a town', () => {
    for (const address of [
      'Ленина, 5',
      'Мира, 10',
      'Комсомольская, 12а',
      'Мира, д. 3',
      'Мира, 7/2',
    ]) {
      expect(namesTown(address)).toBe(false);
      expect(namesPlace(address)).toBe(false);
    }
  });

  it('still sees a town in its own comma part', () => {
    expect(namesTown('Елабуга, Ленина, 5')).toBe(true);
    expect(namesTown('Ленина 5, Бавлы')).toBe(true);
    expect(namesPlace('Казань, ул. Баумана, 1')).toBe(true);
  });
});
