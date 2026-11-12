// Офис агентов: словарь ниш. У агента «Сайты под ключ» — компании без сайта из карт
// (стоматологии, автосервисы, шиномонтаж, салоны красоты, ветклиники, кафе, автомойки,
// фитнес-клубы, юристы, бухгалтеры, ремонт техники, цветы, стройматериалы); у агента
// «Подрядчики» — проект площадки (владелец, 2026-11-12: «всем, кто связан со спецтехникой и
// грузоперевозками»): у кого техника и грузовики (роль provider) и кто технику заказывает —
// дорожники, строители, проектировщики, сметчики, бетонные заводы и карьеры (роль customer).
// Из ниши берутся теги поиска на карте, список услуг для страницы-визитки, строка шапки и
// акцентный цвет. Никаких цен и цифр в текстах (R9).

import { CATEGORIES, categoryBySlug } from '@specai/shared';
import type { AgentId } from './types';

export type NicheKey =
  | 'dentist'
  | 'car_repair'
  | 'tyres'
  | 'beauty'
  | 'vet'
  | 'cafe'
  | 'car_wash'
  | 'fitness'
  | 'lawyer'
  | 'accounting'
  | 'repair'
  | 'florist'
  | 'building_materials'
  | 'machinery'
  | 'freight'
  | 'road_construction'
  | 'construction'
  | 'design_engineering'
  | 'estimators'
  | 'concrete_aggregates';

export type NicheAccent = 'teal' | 'amber' | 'rose' | 'sky' | 'lime' | 'orange';

/**
 * Кто фирма для площадки: `provider` — у неё техника или грузовики, зовём опубликовать парк и
 * брать заявки; `customer` — технику заказывает, зовём заказывать через площадку. Роль задаёт
 * ниша: `Prospect.kind` у всех таких фирм один — 'provider' («проект площадки»), новой колонки
 * в базе нет.
 */
export type PlatformRole = 'provider' | 'customer';

export interface Niche {
  key: NicheKey;
  /** Единственное число: «Стоматология». */
  title: string;
  agent: AgentId;
  /** Роль на площадке — у каждой ниши агента «Подрядчики», у ниш «Сайтов» её нет. */
  role?: PlatformRole;
  osm: {
    /** Пары [ключ, значение] тегов OSM; несколько пар — «или». */
    tags: readonly (readonly [string, string])[];
    /**
     * Дополнительный отбор по названию объекта (ниша «Подрядчики») — в приложении, после ответа
     * Overpass. В сам запрос фильтр по названию не ставится: зеркала на нём не успевают никогда
     * (пробы 10.11.2026: даже по одному редкому тегу — таймаут, без фильтра — 15–23 с).
     */
    nameRegex?: RegExp;
    /** Поисковая фраза для 2ГИС. */
    dgisQuery?: string;
  };
  /** 5–8 услуг ниши для страницы-визитки, без цен. */
  services: readonly string[];
  /** Строка шапки страницы с плейсхолдером {city}. */
  heroLine: string;
  accent: NicheAccent;
}

/**
 * Названия компаний спецтехники. Без `\b`: в JavaScript оно знает только латиницу
 * (tasks/lessons.md, урок 18). Основы слов ловят падежи и множественное число:
 * «экскаваторов», «автокраны», «манипулятора».
 */
export const MACHINERY_NAME_REGEX =
  /спецтехник|аренда (техники|экскаватор|автокран|манипулятор)|экскават|автокран|манипулятор|самосвал|эвакуатор|погрузчик|автовышк|бульдозер|ямобур|бетононасос/i;

/**
 * Дорожные организации по названию: точного тега «дорожное строительство» в OpenStreetMap нет,
 * поэтому ниша ищет по тегам строительных компаний и отбирает названия. «дорожн» — только в
 * начале слова: «Железнодорожный» и «Придорожный» — не дорожники. Сокращения ДРСУ, ДСУ, ДЭП,
 * ДЭУ — целым словом, с цифрой после («ДСУ-3») тоже.
 */
export const ROAD_NAME_REGEX =
  /дорстрой|(?<![а-яё])дорожн|автодор|асфальт|мостострой|мостоотряд|(?<![а-яёa-z0-9])(?:дрсу|дрсп|дсу|дэп|дэу)(?![а-яёa-z])/i;

/**
 * Сметчики по названию: отдельного тега у них нет, ищем среди консалтинга и инженерных бюро.
 * «смет» без «сметан»: кафе «Сметана» — не сметное бюро.
 */
export const ESTIMATOR_NAME_REGEX =
  /смет(?!ан)|ценообразован|стройэкспертиз|строительн[а-яё]* экспертиз/i;

export const NICHES: Record<NicheKey, Niche> = {
  dentist: {
    key: 'dentist',
    title: 'Стоматология',
    agent: 'sites',
    osm: {
      dgisQuery: 'стоматология',
      tags: [
        ['amenity', 'dentist'],
        ['healthcare', 'dentist'],
      ],
    },
    services: [
      'Лечение кариеса',
      'Профессиональная чистка зубов',
      'Удаление зубов',
      'Протезирование',
      'Имплантация',
      'Исправление прикуса',
      'Детская стоматология',
    ],
    heroLine: 'Стоматология в городе {city}: лечение, чистка, протезирование',
    accent: 'teal',
  },
  car_repair: {
    key: 'car_repair',
    title: 'Автосервис',
    agent: 'sites',
    osm: {
      dgisQuery: 'автосервис',
      tags: [['shop', 'car_repair']],
    },
    services: [
      'Диагностика автомобиля',
      'Ремонт двигателя',
      'Ремонт ходовой части',
      'Ремонт тормозной системы',
      'Замена масла и фильтров',
      'Развал-схождение',
      'Ремонт электрики',
      'Кузовной ремонт',
    ],
    heroLine: 'Автосервис в городе {city}: диагностика, ремонт, обслуживание',
    accent: 'sky',
  },
  tyres: {
    key: 'tyres',
    title: 'Шиномонтаж',
    agent: 'sites',
    osm: {
      dgisQuery: 'шиномонтаж',
      tags: [['shop', 'tyres']],
    },
    services: [
      'Сезонная замена шин',
      'Балансировка колёс',
      'Ремонт проколов',
      'Правка дисков',
      'Подбор и продажа шин',
      'Сезонное хранение шин',
    ],
    heroLine: 'Шиномонтаж в городе {city}: замена, балансировка, ремонт',
    accent: 'amber',
  },
  beauty: {
    key: 'beauty',
    title: 'Салон красоты',
    agent: 'sites',
    osm: {
      dgisQuery: 'салон красоты',
      tags: [
        ['shop', 'beauty'],
        ['shop', 'hairdresser'],
      ],
    },
    services: [
      'Женские и мужские стрижки',
      'Окрашивание волос',
      'Укладка и причёски',
      'Маникюр и педикюр',
      'Уход за лицом',
      'Коррекция и окрашивание бровей',
      'Макияж',
    ],
    heroLine: 'Салон красоты в городе {city}: стрижки, окрашивание, уход',
    accent: 'rose',
  },
  vet: {
    key: 'vet',
    title: 'Ветеринарная клиника',
    agent: 'sites',
    osm: {
      dgisQuery: 'ветеринарная клиника',
      tags: [['amenity', 'veterinary']],
    },
    services: [
      'Приём и осмотр животных',
      'Вакцинация',
      'Лечение и терапия',
      'Хирургия',
      'Стерилизация и кастрация',
      'Анализы и УЗИ',
      'Стоматология для животных',
      'Чипирование',
    ],
    heroLine: 'Ветеринарная клиника в городе {city}: приём, вакцинация, лечение',
    accent: 'lime',
  },
  cafe: {
    key: 'cafe',
    title: 'Кафе',
    agent: 'sites',
    osm: {
      dgisQuery: 'кафе',
      // Столовые в OSM — то amenity=cafe, то amenity=canteen.
      tags: [
        ['amenity', 'cafe'],
        ['amenity', 'canteen'],
      ],
    },
    services: [
      'Завтраки',
      'Комплексные обеды',
      'Блюда домашней кухни',
      'Выпечка и десерты',
      'Кофе и напитки',
      'Еда с собой',
      'Банкеты и праздники',
    ],
    heroLine: 'Кафе в городе {city}: обеды, домашняя кухня, еда с собой',
    accent: 'amber',
  },
  car_wash: {
    key: 'car_wash',
    title: 'Автомойка',
    agent: 'sites',
    osm: {
      dgisQuery: 'автомойка',
      tags: [['amenity', 'car_wash']],
    },
    services: [
      'Мойка кузова',
      'Комплексная мойка',
      'Уборка салона',
      'Химчистка салона',
      'Мойка двигателя',
      'Чернение шин',
      'Полировка кузова',
    ],
    heroLine: 'Автомойка в городе {city}: мойка кузова, уборка и химчистка салона',
    accent: 'sky',
  },
  fitness: {
    key: 'fitness',
    title: 'Фитнес-клуб',
    agent: 'sites',
    osm: {
      dgisQuery: 'фитнес-клуб',
      tags: [['leisure', 'fitness_centre']],
    },
    services: [
      'Тренажёрный зал',
      'Групповые тренировки',
      'Персональные тренировки',
      'Функциональный тренинг',
      'Йога и растяжка',
      'Абонементы и разовые посещения',
      'Программы тренировок',
    ],
    heroLine: 'Фитнес-клуб в городе {city}: тренажёрный зал, групповые и персональные тренировки',
    accent: 'orange',
  },
  lawyer: {
    key: 'lawyer',
    title: 'Юридические услуги',
    agent: 'sites',
    osm: {
      dgisQuery: 'юридические услуги',
      tags: [['office', 'lawyer']],
    },
    services: [
      'Консультации юриста',
      'Составление договоров',
      'Претензии и иски',
      'Представительство в суде',
      'Семейные и наследственные дела',
      'Споры о недвижимости',
      'Защита прав потребителей',
      'Сопровождение бизнеса',
    ],
    heroLine: 'Юридические услуги в городе {city}: консультации, договоры, суды',
    accent: 'teal',
  },
  accounting: {
    key: 'accounting',
    title: 'Бухгалтерские услуги',
    agent: 'sites',
    osm: {
      dgisQuery: 'бухгалтерские услуги',
      tags: [
        ['office', 'accountant'],
        ['office', 'tax_advisor'],
      ],
    },
    services: [
      'Бухгалтерское обслуживание',
      'Налоговая отчётность',
      'Регистрация ИП и ООО',
      'Расчёт зарплаты и кадры',
      'Декларации для физических лиц',
      'Восстановление учёта',
      'Консультации по налогам',
    ],
    heroLine: 'Бухгалтерские услуги в городе {city}: учёт, отчётность, налоги',
    accent: 'lime',
  },
  repair: {
    key: 'repair',
    title: 'Ремонт техники и электроники',
    agent: 'sites',
    osm: {
      dgisQuery: 'ремонт техники',
      tags: [
        ['craft', 'electronics_repair'],
        ['shop', 'electronics_repair'],
      ],
    },
    services: [
      'Ремонт телефонов и планшетов',
      'Ремонт ноутбуков и компьютеров',
      'Ремонт телевизоров',
      'Ремонт бытовой техники',
      'Замена экранов и аккумуляторов',
      'Диагностика неисправностей',
      'Чистка и профилактика',
    ],
    heroLine: 'Ремонт техники и электроники в городе {city}: телефоны, ноутбуки, бытовая техника',
    accent: 'sky',
  },
  florist: {
    key: 'florist',
    title: 'Цветочный магазин',
    agent: 'sites',
    osm: {
      dgisQuery: 'цветы',
      tags: [['shop', 'florist']],
    },
    services: [
      'Букеты на заказ',
      'Свежие цветы в наличии',
      'Цветы в коробках и корзинах',
      'Оформление праздников',
      'Свадебная флористика',
      'Комнатные растения',
      'Открытки и упаковка',
    ],
    heroLine: 'Цветочный магазин в городе {city}: букеты, композиции, цветы к празднику',
    accent: 'rose',
  },
  building_materials: {
    key: 'building_materials',
    title: 'Стройматериалы',
    agent: 'sites',
    osm: {
      dgisQuery: 'стройматериалы',
      tags: [
        ['shop', 'doityourself'],
        ['shop', 'building_materials'],
        ['trade', 'building_supplies'],
      ],
    },
    services: [
      'Сухие смеси и цемент',
      'Пиломатериалы',
      'Кровля и сайдинг',
      'Утеплители',
      'Отделочные материалы',
      'Крепёж и инструмент',
      'Сантехника и электрика',
    ],
    heroLine: 'Стройматериалы в городе {city}: смеси, пиломатериалы, кровля, отделка',
    accent: 'orange',
  },
  machinery: {
    key: 'machinery',
    title: 'Спецтехника',
    agent: 'providers',
    role: 'provider',
    osm: {
      dgisQuery: 'аренда спецтехники',
      // Теги, по которым Overpass отвечает с раннера без фильтра названий (проба 10.11.2026,
      // Казань, 15 км: прокат и грузовики — 24 объекта, office=company — 529, craft — 360).
      // industrial=* и shop=car убраны: это участки промзон и автосалоны, а не аренда техники.
      tags: [
        ['shop', 'rental'],
        ['shop', 'truck'],
        ['office', 'company'],
        ['craft', '*'],
      ],
      nameRegex: MACHINERY_NAME_REGEX,
    },
    services: [
      'Аренда спецтехники с машинистом',
      'Земляные работы',
      'Погрузка и перевозка грузов',
      'Подъём и монтаж',
      'Вывоз грунта и строительного мусора',
      'Работа на объектах и площадках',
    ],
    heroLine: 'Спецтехника в городе {city}: аренда с машинистом, заказ напрямую',
    accent: 'orange',
  },
  freight: {
    key: 'freight',
    title: 'Грузоперевозки',
    agent: 'providers',
    role: 'provider',
    osm: {
      dgisQuery: 'грузоперевозки',
      // Точные теги: офис логистической или транспортной компании и перевозчик-«переезды».
      // Фильтр по названию не нужен, поэтому нишу умеет искать и Nominatim.
      tags: [
        ['office', 'logistics'],
        ['office', 'moving_company'],
      ],
    },
    services: [
      'Перевозка грузов по городу и области',
      'Междугородние рейсы',
      'Доставка стройматериалов на объект',
      'Перевозка техники и негабарита',
      'Погрузка и разгрузка',
      'Работа по разовым заявкам и по договору',
    ],
    heroLine: 'Грузоперевозки в городе {city}: рейсы по городу и между городами, заказ напрямую',
    accent: 'sky',
  },
  // Порядок важен: дорожники идут в плане раньше строителей. Теги у них общие, и фирма с
  // «дорожным» названием должна получить письмо дорожникам, а не общее письмо строителям.
  road_construction: {
    key: 'road_construction',
    title: 'Дорожное строительство',
    agent: 'providers',
    role: 'customer',
    osm: {
      dgisQuery: 'дорожное строительство',
      // Своего тега у дорожников нет: строительные компании и офисы фирм, отбор по названию —
      // как у спецтехники, после ответа Overpass. В Москве и Петербурге office=company из
      // запроса убирается (run.ts → relayNiche).
      tags: [
        ['office', 'construction_company'],
        ['office', 'company'],
      ],
      nameRegex: ROAD_NAME_REGEX,
    },
    services: [
      'Строительство и ремонт дорог',
      'Укладка асфальта',
      'Устройство оснований и земляного полотна',
      'Благоустройство территорий',
      'Содержание дорог',
      'Ямочный ремонт',
    ],
    heroLine: 'Дорожное строительство в городе {city}: дороги, асфальт, благоустройство',
    accent: 'amber',
  },
  construction: {
    key: 'construction',
    title: 'Строительная компания',
    agent: 'providers',
    role: 'customer',
    osm: {
      dgisQuery: 'строительная компания',
      tags: [
        ['office', 'construction_company'],
        ['craft', 'builder'],
      ],
    },
    services: [
      'Строительство домов и зданий',
      'Фундаменты и земляные работы',
      'Монолитные и кладочные работы',
      'Кровельные и фасадные работы',
      'Инженерные сети',
      'Реконструкция и капитальный ремонт',
    ],
    heroLine: 'Строительная компания в городе {city}: дома, фундаменты, инженерные сети',
    accent: 'orange',
  },
  design_engineering: {
    key: 'design_engineering',
    title: 'Проектирование и изыскания',
    agent: 'providers',
    role: 'customer',
    osm: {
      dgisQuery: 'проектная организация',
      // Архитектурные бюро, инженерные и проектные бюро, геодезисты и кадастровые инженеры.
      tags: [
        ['office', 'architect'],
        ['office', 'engineer'],
        ['office', 'surveyor'],
      ],
    },
    services: [
      'Архитектурное проектирование',
      'Проектирование конструкций и инженерных сетей',
      'Инженерные изыскания',
      'Геодезические работы',
      'Проект организации строительства',
      'Авторский надзор',
    ],
    heroLine: 'Проектирование и изыскания в городе {city}: проекты, геодезия, изыскания',
    accent: 'teal',
  },
  estimators: {
    key: 'estimators',
    title: 'Сметное бюро',
    agent: 'providers',
    role: 'customer',
    osm: {
      dgisQuery: 'составление смет',
      // Тега «сметчик» в OpenStreetMap нет: консалтинг, инженерные бюро и офисы фирм, отбор по
      // названию (ESTIMATOR_NAME_REGEX) после ответа Overpass.
      tags: [
        ['office', 'consulting'],
        ['office', 'engineer'],
        ['office', 'company'],
      ],
      nameRegex: ESTIMATOR_NAME_REGEX,
    },
    services: [
      'Составление смет',
      'Проверка и пересчёт смет',
      'Сметы на ремонт и строительство',
      'Ведомости объёмов работ',
      'Исполнительная документация',
      'Строительная экспертиза',
    ],
    heroLine: 'Сметное бюро в городе {city}: сметы, проверка, строительная экспертиза',
    accent: 'lime',
  },
  concrete_aggregates: {
    key: 'concrete_aggregates',
    title: 'Бетон и нерудные материалы',
    agent: 'providers',
    role: 'customer',
    osm: {
      dgisQuery: 'бетонный завод',
      // Бетонные заводы и карьеры — им нужны самосвалы и миксеры под отгрузку. Асфальтовые
      // заводы отдельным точным тегом не размечены, по названию их ловит ниша дорожников.
      tags: [
        ['industrial', 'concrete_plant'],
        ['landuse', 'quarry'],
      ],
    },
    services: [
      'Товарный бетон и раствор',
      'Песок и щебень',
      'Песчано-гравийная смесь',
      'Доставка на объект',
      'Отгрузка с завода и из карьера',
    ],
    heroLine: 'Бетон и нерудные материалы в городе {city}: бетон, песок, щебень, доставка',
    accent: 'amber',
  },
};

/**
 * Основы названий видов техники → slug вида из packages/shared/src/categories.ts.
 * Порядок важен: «экскаватор-погрузчик» — один вид, а не экскаватор плюс погрузчик.
 */
const W = '(?<![а-яёa-z0-9])';
const MACHINERY_KINDS: readonly { re: RegExp; slug: string }[] = [
  { re: /экскаватор[а-яё]*[\s-]+погрузчик/, slug: 'backhoe-loaders' },
  { re: /мини[\s-]*экскават/, slug: 'mini-excavators' },
  { re: /экскават/, slug: 'excavators' },
  { re: /автокран/, slug: 'cranes' },
  { re: new RegExp(`манипулятор|${W}кму(?![а-яёa-z0-9])`), slug: 'crane-trucks' },
  { re: /самосвал/, slug: 'dump-trucks' },
  { re: /эвакуатор/, slug: 'tow-trucks' },
  { re: /вилочн[а-яё]* погрузчик/, slug: 'forklifts' },
  { re: /погрузчик/, slug: 'loaders' },
  { re: new RegExp(`автовышк|${W}агп(?![а-яёa-z0-9])`), slug: 'aerial-platforms' },
  { re: /бульдозер/, slug: 'bulldozers' },
  { re: /ямобур/, slug: 'augers' },
  { re: /бетононасос/, slug: 'concrete-pumps' },
];

// Все slug-и выше должны существовать в shared: защита от опечатки при старте модуля.
for (const kind of MACHINERY_KINDS) {
  if (!categoryBySlug(kind.slug)) {
    throw new Error(`lib/office/niches.ts: неизвестный вид техники «${kind.slug}»`);
  }
}

/**
 * Виды техники (slug-и из categories.ts) по названию компании и, если есть, по тегам OSM
 * (`description`, `name:ru`). Русские основы без `\b` ловят падежи: «Аренда экскаваторов»
 * → ['excavators']; «Экскаватор-погрузчик» → ['backhoe-loaders'] (без 'loaders').
 */
export function machineryTags(name: string, osmTags?: Record<string, string>): string[] {
  const text = [name, osmTags?.description, osmTags?.['name:ru'], osmTags?.['official_name']]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е');
  const haystack = text.replace(/экскаватор[а-яе]*[\s-]+погрузчик[а-яе]*/g, (m) =>
    m.replace(/погрузчик/g, 'погр_'),
  );
  const found: string[] = [];
  for (const kind of MACHINERY_KINDS) {
    const re = new RegExp(kind.re.source.replace(/ё/g, 'е'));
    const target = kind.slug === 'backhoe-loaders' ? text : haystack;
    if (re.test(target) && !found.includes(kind.slug)) found.push(kind.slug);
  }
  if (found.includes('backhoe-loaders')) {
    // Экскаватор-погрузчик — не гусеничный экскаватор.
    const onlyCombined = !/экскават(?![а-яе]*[\s-]+погр)/.test(haystack);
    if (onlyCombined) {
      const i = found.indexOf('excavators');
      if (i >= 0) found.splice(i, 1);
    }
  }
  return found;
}

export function nicheByKey(key: string | null | undefined): Niche | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(NICHES, key) ? NICHES[key as NicheKey] : null;
}

export function nichesOf(agent: AgentId): Niche[] {
  return Object.values(NICHES).filter((n) => n.agent === agent);
}

/**
 * Роль фирмы на площадке по ключу её ниши. Неизвестная ниша и ниша без роли — 'provider':
 * так писали всем фирмам проекта до появления заказчиков, и старые строки не меняют письмо.
 */
export function platformRole(key: string | null | undefined): PlatformRole {
  return nicheByKey(key)?.role ?? 'provider';
}

/** «Стоматология» по ключу; неизвестный ключ возвращается как есть. */
export function nicheTitle(key: string): string {
  return nicheByKey(key)?.title ?? key;
}

/** Названия видов техники для страницы подрядчика: tags → «Экскаваторы гусеничные». */
export function machineryNames(tags: string | readonly string[] | null | undefined): string[] {
  const slugs = Array.isArray(tags)
    ? (tags as string[])
    : String(tags ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return slugs
    .map((slug) => CATEGORIES.find((c) => c.slug === slug)?.name)
    .filter((n): n is string => Boolean(n));
}
