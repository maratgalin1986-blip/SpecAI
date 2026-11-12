import { categoryBySlug } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import { AGENTS, MEDICAL_NICHES } from './agents';
import { SITE_ACCENTS } from './siteContent';
import { parseOfficeCommand } from './telegramCommand';
import {
  ESTIMATOR_NAME_REGEX,
  MACHINERY_NAME_REGEX,
  NICHES,
  ROAD_NAME_REGEX,
  platformRole,
  machineryNames,
  machineryTags,
  nicheByKey,
  nicheTitle,
  nichesOf,
} from './niches';

/** Ниши проекта площадки в порядке обхода: сначала у кого техника, потом заказчики. */
const PLATFORM_NICHES = [
  'machinery',
  'freight',
  'road_construction',
  'construction',
  'design_engineering',
  'estimators',
  'concrete_aggregates',
];

/**
 * Теги новых ниш — ровно эти пары. Все — документированные значения OpenStreetMap (office=*,
 * craft=builder, industrial=concrete_plant, landuse=quarry): тест ловит опечатку и случайную
 * замену точного тега широким.
 */
const PLATFORM_TAGS: Record<string, string[]> = {
  freight: ['office=logistics', 'office=moving_company'],
  road_construction: ['office=construction_company', 'office=company'],
  construction: ['office=construction_company', 'craft=builder'],
  design_engineering: ['office=architect', 'office=engineer', 'office=surveyor'],
  estimators: ['office=consulting', 'office=engineer', 'office=company'],
  concrete_aggregates: ['industrial=concrete_plant', 'landuse=quarry'],
};

describe('office niches: dictionary', () => {
  it('splits the niches between the two agents', () => {
    expect(nichesOf('sites').map((n) => n.key)).toEqual([
      'dentist',
      'car_repair',
      'tyres',
      'beauty',
      'vet',
      'cafe',
      'car_wash',
      'fitness',
      'lawyer',
      'accounting',
      'repair',
      'florist',
      'building_materials',
    ]);
    expect(nichesOf('providers').map((n) => n.key)).toEqual(PLATFORM_NICHES);
  });

  it('agents walk every niche of their own, keys match the dictionary', () => {
    expect(AGENTS.sites.defaultNiches).toEqual(
      nichesOf('sites')
        .map((n) => n.key)
        .filter((k) => !MEDICAL_NICHES.includes(k)),
    );
    expect(AGENTS.providers.defaultNiches).toEqual(PLATFORM_NICHES);
    for (const [key, niche] of Object.entries(NICHES)) {
      expect(niche.key).toBe(key);
      expect(key).toMatch(/^[a-z_]+$/);
    }
    const titles = Object.values(NICHES).map((n) => n.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('every site niche can be searched on both maps and painted in a site colour', () => {
    for (const niche of nichesOf('sites')) {
      expect(niche.osm.tags.length).toBeGreaterThan(0);
      for (const [k, v] of niche.osm.tags) {
        expect(k).toMatch(/^[a-z_]+$/);
        expect(v).toMatch(/^[a-z_]+$/);
      }
      // Без фильтра по названию: широкие теги — только у подрядчиков.
      expect(niche.osm.nameRegex).toBeUndefined();
      expect(niche.osm.dgisQuery?.trim()).toBeTruthy();
      expect(niche.heroLine).toContain('в городе {city}');
      expect(new Set(niche.services).size).toBe(niche.services.length);
      expect((SITE_ACCENTS as readonly string[]).includes(niche.accent)).toBe(true);
    }
  });

  it('new niches of the sites agent: 6–8 services each', () => {
    for (const key of [
      'cafe',
      'car_wash',
      'fitness',
      'lawyer',
      'accounting',
      'repair',
      'florist',
      'building_materials',
    ]) {
      const niche = nicheByKey(key);
      expect(niche?.agent).toBe('sites');
      expect(niche!.services.length).toBeGreaterThanOrEqual(6);
      expect(niche!.services.length).toBeLessThanOrEqual(8);
    }
  });

  it('the owner can start a new niche from Telegram by its Russian title or key', () => {
    expect(parseOfficeCommand('/office кафе Казань')).toMatchObject({
      ok: true,
      agent: 'sites',
      niche: 'cafe',
    });
    expect(parseOfficeCommand('/office автомойка Набережные Челны')).toMatchObject({
      ok: true,
      niche: 'car_wash',
      city: 'Набережные Челны',
    });
    expect(parseOfficeCommand('/office юридические услуги Уфа')).toMatchObject({
      ok: true,
      niche: 'lawyer',
    });
    expect(parseOfficeCommand('/office building_materials Казань')).toMatchObject({
      ok: true,
      niche: 'building_materials',
    });
    // «Автомойка» не путается с «Автосервисом».
    expect(parseOfficeCommand('/office автосервис Казань')).toMatchObject({
      ok: true,
      niche: 'car_repair',
    });
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
    expect(nicheTitle('car_wash')).toBe('Автомойка');
    expect(nicheTitle('building_materials')).toBe('Стройматериалы');
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
    // Новые ниши «Сайтов» не попадают к подрядчикам по названию.
    for (const name of ['Кафе Ромашка', 'Цветочный магазин', 'Стройматериалы', 'Ремонт техники']) {
      expect(MACHINERY_NAME_REGEX.test(name)).toBe(false);
    }
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

describe('office niches: проект площадки', () => {
  it('у каждой ниши «Подрядчиков» есть роль, у ниш «Сайтов» её нет', () => {
    expect(Object.fromEntries(nichesOf('providers').map((n) => [n.key, n.role]))).toEqual({
      machinery: 'provider',
      freight: 'provider',
      road_construction: 'customer',
      construction: 'customer',
      design_engineering: 'customer',
      estimators: 'customer',
      concrete_aggregates: 'customer',
    });
    for (const niche of nichesOf('sites')) expect(niche.role).toBeUndefined();
  });

  it('platformRole: роль по ключу ниши; без ниши и для старых строк — исполнитель', () => {
    expect(platformRole('freight')).toBe('provider');
    expect(platformRole('estimators')).toBe('customer');
    expect(platformRole('machinery')).toBe('provider');
    expect(platformRole(null)).toBe('provider');
    expect(platformRole('нет такой')).toBe('provider');
  });

  it.each(Object.entries(PLATFORM_TAGS))('%s: теги карты, фраза 2ГИС, услуги', (key, tags) => {
    const niche = nicheByKey(key)!;
    expect(niche.agent).toBe('providers');
    expect(niche.osm.tags.map(([k, v]) => `${k}=${v}`)).toEqual(tags);
    expect(niche.osm.dgisQuery?.trim()).toBeTruthy();
    expect(niche.services.length).toBeGreaterThanOrEqual(5);
    expect(new Set(niche.services).size).toBe(niche.services.length);
    expect(niche.heroLine).toContain('в городе {city}');
    expect((SITE_ACCENTS as readonly string[]).includes(niche.accent)).toBe(true);
  });

  it('отбор по названию — только там, где точного тега нет: дорожники и сметчики', () => {
    expect(nicheByKey('road_construction')!.osm.nameRegex).toBe(ROAD_NAME_REGEX);
    expect(nicheByKey('estimators')!.osm.nameRegex).toBe(ESTIMATOR_NAME_REGEX);
    for (const key of ['freight', 'construction', 'design_engineering', 'concrete_aggregates']) {
      const niche = nicheByKey(key)!;
      expect(niche.osm.nameRegex).toBeUndefined();
      // Без «*»: широких тегов у ниш без отбора по названию быть не должно.
      for (const [, v] of niche.osm.tags) expect(v).toMatch(/^[a-z_]+$/);
      expect(niche.osm.tags.map(([k, v]) => `${k}=${v}`)).not.toContain('office=company');
    }
  });

  it('дорожники по названию: основы и сокращения, без железной дороги и «придорожного»', () => {
    for (const name of [
      'ООО «Дорстрой»',
      'Дорожное ремонтно-строительное управление',
      'Татавтодор',
      'Асфальтобетонный завод',
      'Мостострой-12',
      'ДРСУ',
      'ДСУ-3',
      'АО ДЭП № 7',
    ]) {
      expect(ROAD_NAME_REGEX.test(name), name).toBe(true);
    }
    for (const name of [
      'Железнодорожная больница',
      'Придорожное кафе',
      'Стройматериалы',
      'ООО «Ромашка»',
      'Подсудимов и партнёры',
    ]) {
      expect(ROAD_NAME_REGEX.test(name), name).toBe(false);
    }
  });

  it('сметчики по названию: «смета», «сметное», «ценообразование» — но не «Сметана»', () => {
    for (const name of [
      'Сметное бюро',
      'ООО «Смета Плюс»',
      'Проектно-сметная группа',
      'Центр ценообразования в строительстве',
      'Строительная экспертиза',
    ]) {
      expect(ESTIMATOR_NAME_REGEX.test(name), name).toBe(true);
    }
    for (const name of ['Кафе «Сметана»', 'Консалтинг Групп', 'Юридическая экспертиза']) {
      expect(ESTIMATOR_NAME_REGEX.test(name), name).toBe(false);
    }
  });

  it('названия ниш не начинаются одинаково: команда /office различает их', () => {
    expect(parseOfficeCommand('/office грузоперевозки Чита')).toMatchObject({
      ok: true,
      agent: 'providers',
      niche: 'freight',
      city: 'Чита',
    });
    expect(parseOfficeCommand('/office дорожное строительство Омск')).toMatchObject({
      ok: true,
      niche: 'road_construction',
    });
    expect(parseOfficeCommand('/office строительная компания Омск')).toMatchObject({
      ok: true,
      niche: 'construction',
    });
  });
});
