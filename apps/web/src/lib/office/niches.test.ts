import { categoryBySlug } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import {
  MACHINERY_NAME_REGEX,
  NICHES,
  machineryNames,
  machineryTags,
  nicheByKey,
  nicheTitle,
  nichesOf,
} from './niches';

describe('office niches: dictionary', () => {
  it('splits the niches between the two agents', () => {
    expect(nichesOf('sites').map((n) => n.key)).toEqual([
      'dentist',
      'car_repair',
      'tyres',
      'beauty',
      'vet',
    ]);
    expect(nichesOf('providers').map((n) => n.key)).toEqual(['machinery']);
  });

  it('has 5–8 services, a {city} hero line and no digits in texts', () => {
    for (const niche of Object.values(NICHES)) {
      expect(niche.services.length).toBeGreaterThanOrEqual(5);
      expect(niche.services.length).toBeLessThanOrEqual(8);
      expect(niche.heroLine).toContain('{city}');
      for (const text of [...niche.services, niche.heroLine, niche.title]) {
        expect(text).not.toMatch(/\d/);
      }
    }
  });

  it('looks up niches by key', () => {
    expect(nicheByKey('dentist')?.title).toBe('Стоматология');
    expect(nicheByKey('toString')).toBeNull();
    expect(nicheByKey('')).toBeNull();
    expect(nicheTitle('vet')).toBe('Ветеринарная клиника');
    expect(nicheTitle('x')).toBe('x');
  });
});

describe('office niches: machinery', () => {
  it('nameRegex catches machinery companies in any case form and skips others', () => {
    expect(MACHINERY_NAME_REGEX.test('Аренда экскаваторов')).toBe(true);
    expect(MACHINERY_NAME_REGEX.test('ООО Автокраны Казани')).toBe(true);
    expect(MACHINERY_NAME_REGEX.test('Манипулятор-эвакуатор')).toBe(true);
    expect(MACHINERY_NAME_REGEX.test('СПЕЦТЕХНИКА 16')).toBe(true);
    expect(MACHINERY_NAME_REGEX.test('Автомойка')).toBe(false);
    expect(MACHINERY_NAME_REGEX.test('Автозапчасти')).toBe(false);
    expect(MACHINERY_NAME_REGEX.test('Шиномонтаж')).toBe(false);
  });

  it('machineryTags returns existing category slugs from Russian names', () => {
    expect(machineryTags('Аренда экскаваторов')).toEqual(['excavators']);
    expect(machineryTags('ООО Автокраны Казани')).toEqual(['cranes']);
    expect(machineryTags('Манипулятор-эвакуатор')).toEqual(['crane-trucks', 'tow-trucks']);
    expect(machineryTags('Услуги КМУ и АГП')).toEqual(['crane-trucks', 'aerial-platforms']);
    expect(machineryTags('Самосвалы, бульдозер, ямобур, бетононасос')).toEqual([
      'dump-trucks',
      'bulldozers',
      'augers',
      'concrete-pumps',
    ]);
    expect(machineryTags('Автомойка')).toEqual([]);
    for (const slug of machineryTags('экскаватор автокран манипулятор самосвал погрузчик')) {
      expect(categoryBySlug(slug)).toBeDefined();
    }
  });

  it('treats a backhoe loader as one kind, not an excavator plus a loader', () => {
    expect(machineryTags('Экскаватор-погрузчик JCB')).toEqual(['backhoe-loaders']);
    expect(machineryTags('Экскаваторы и погрузчики')).toEqual(['excavators', 'loaders']);
    expect(machineryTags('Мини-экскаватор')).toEqual(['mini-excavators', 'excavators']);
  });

  it('does not match «кму» inside other words and reads OSM tags too', () => {
    expect(machineryTags('Закмурье')).toEqual([]);
    expect(machineryTags('ООО Ромашка', { description: 'аренда автовышки' })).toEqual([
      'aerial-platforms',
    ]);
  });

  it('machineryNames maps slugs to category names', () => {
    expect(machineryNames('cranes, tow-trucks, nope')).toEqual(['Автокраны', 'Эвакуаторы']);
    expect(machineryNames(null)).toEqual([]);
  });
});
