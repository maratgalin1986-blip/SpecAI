// The catalogue of machinery types: ten groups («Землеройная техника»,
// «Подъёмная техника», …) and the categories inside them, as on Avito's
// «Спецтехника» rubric (owner, 2026-10-11). This file is the single source:
// packages/database/prisma/ensure-categories.ts seeds the EquipmentCategory
// rows from it (parents = groups, children = categories, matched by slug), the
// web app takes labels, emoji and keywords from here without the database, and
// the mobile app receives `group` and `emoji` through GET /api/categories.
//
// Adding a category: add it here (unique slug and name), run
// `pnpm --filter @specai/database ensure-categories`. Never rename a slug —
// orders, machines and landings reference it.

export interface CategoryGroup {
  slug: string;
  name: string;
  emoji: string;
}

export interface CategoryDef {
  slug: string;
  name: string;
  /** Slug of the group (a parent EquipmentCategory row). */
  group: string;
  emoji: string;
  /**
   * Lower-case word stems that mean this machine in a chat message
   * («экскаватор» also matches «экскаватора»); matched at a word start, ё = е.
   */
  keywords: string[];
  /**
   * When several categories match one message the highest priority wins
   * («нужен трал перевезти экскаватор» is a transport request); default 0.
   */
  priority?: number;
}

export const CATEGORY_GROUPS = [
  { slug: 'earthmoving', name: 'Землеройная техника', emoji: '🚜' },
  { slug: 'lifting', name: 'Подъёмная техника', emoji: '🏗️' },
  { slug: 'loading', name: 'Погрузочная техника', emoji: '🏗' },
  { slug: 'hauling', name: 'Грузовой транспорт и перевозка', emoji: '🚛' },
  { slug: 'road', name: 'Дорожно-строительная техника', emoji: '🛣️' },
  { slug: 'concrete', name: 'Бетон и растворы', emoji: '🧱' },
  { slug: 'drilling', name: 'Бурение, сваи, грунт', emoji: '🕳️' },
  { slug: 'municipal', name: 'Коммунальная и уборочная техника', emoji: '💧' },
  { slug: 'equipment', name: 'Энергия и оборудование', emoji: '⚡' },
  { slug: 'agri-forestry', name: 'Сельхоз и лесная техника', emoji: '🌾' },
] as const satisfies readonly CategoryGroup[];

export type CategoryGroupSlug = (typeof CATEGORY_GROUPS)[number]['slug'];

/** The ten categories the site started with: shown first in the pickers. */
export const POPULAR_CATEGORY_SLUGS: readonly string[] = [
  'backhoe-loaders',
  'excavators',
  'cranes',
  'crane-trucks',
  'aerial-platforms',
  'loaders',
  'dump-trucks',
  'bulldozers',
  'tractors',
  'rollers',
];

export const CATEGORIES: readonly CategoryDef[] = [
  // 1. Землеройная техника
  {
    slug: 'excavators',
    name: 'Экскаваторы гусеничные',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['экскаватор', 'полноповоротн', 'hitachi', 'хитачи', 'komatsu', 'коматсу'],
  },
  {
    slug: 'wheeled-excavators',
    name: 'Экскаваторы колёсные',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['колесный экскаватор', 'колесник', 'экскаватор колесный', 'пневмоколесн'],
    priority: 1,
  },
  {
    slug: 'mini-excavators',
    name: 'Мини-экскаваторы',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['мини-экскаватор', 'мини экскаватор', 'миниэкскаватор', 'мини-экскават'],
    priority: 1,
  },
  {
    slug: 'backhoe-loaders',
    name: 'Экскаваторы-погрузчики',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: [
      'экскаватор-погрузчик',
      'экскаватор погрузчик',
      'погрузчик-экскаватор',
      'погрузчик экскаватор',
      'jcb',
      'джисиби',
      '3cx',
      '4cx',
      'case 570',
      'case570',
      'кейс',
      'hidromek',
      'гидромек',
      'terex',
      'терекс',
      'гидромолот',
    ],
    priority: 2,
  },
  {
    slug: 'bulldozers',
    name: 'Бульдозеры',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['бульдозер', 'дозер', 'шантуй', 'shantui'],
  },
  {
    slug: 'graders',
    name: 'Грейдеры',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['грейдер', 'автогрейдер'],
  },
  {
    slug: 'trenchers',
    name: 'Траншеекопатели',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['траншеекопател', 'траншейн', 'траншейная машина'],
  },
  {
    slug: 'scrapers',
    name: 'Скреперы',
    group: 'earthmoving',
    emoji: '🚜',
    keywords: ['скрепер'],
  },

  // 2. Подъёмная техника
  {
    slug: 'cranes',
    name: 'Автокраны',
    group: 'lifting',
    emoji: '🏗️',
    keywords: ['автокран', 'кран', 'кс-', 'ивановец', 'галичанин', 'клинцы'],
  },
  {
    slug: 'crane-trucks',
    name: 'Краны-манипуляторы (КМУ)',
    group: 'lifting',
    emoji: '🏗️',
    keywords: ['манипулятор', 'кму', 'воровайк', 'кран-манипулятор'],
    priority: 1,
  },
  {
    slug: 'aerial-platforms',
    name: 'Автовышки (АГП)',
    group: 'lifting',
    emoji: '🪜',
    keywords: ['автовышк', 'вышка', 'вышки', 'вышку', 'агп', 'автогидроподъемник'],
  },
  {
    slug: 'tower-cranes',
    name: 'Башенные краны',
    group: 'lifting',
    emoji: '🏗️',
    keywords: ['башенный кран', 'башенн', 'кб-'],
    priority: 1,
  },
  {
    slug: 'crawler-cranes',
    name: 'Гусеничные краны',
    group: 'lifting',
    emoji: '🏗️',
    keywords: ['гусеничный кран', 'кран гусеничн', 'кран на гусеницах'],
    priority: 1,
  },
  {
    slug: 'telehandlers',
    name: 'Телескопические погрузчики',
    group: 'lifting',
    emoji: '🏗',
    keywords: ['телескоп', 'телехендлер', 'manitou', 'маниту', 'телескопический погрузчик'],
    priority: 1,
  },
  {
    slug: 'scissor-lifts',
    name: 'Ножничные и коленчатые подъёмники',
    group: 'lifting',
    emoji: '🪜',
    keywords: ['ножничн', 'коленчат', 'подъемник', 'самоходный подъемник'],
  },

  // 3. Погрузочная техника
  {
    slug: 'loaders',
    name: 'Фронтальные погрузчики',
    group: 'loading',
    emoji: '🚜',
    keywords: ['фронтальн', 'фронтальник', 'погрузчик', 'амкодор', 'lonking', 'sdlg'],
  },
  {
    slug: 'skid-steers',
    name: 'Мини-погрузчики (бобкэт)',
    group: 'loading',
    emoji: '🚜',
    keywords: ['бобкэт', 'бобкет', 'bobcat', 'мини-погрузчик', 'мини погрузчик', 'минипогрузчик'],
    priority: 1,
  },
  {
    slug: 'forklifts',
    name: 'Вилочные погрузчики',
    group: 'loading',
    emoji: '🏗',
    keywords: ['вилочн', 'вилочный погрузчик', 'автопогрузчик', 'ричтрак', 'штабелер'],
    priority: 1,
  },
  {
    slug: 'tractors',
    name: 'Тракторы',
    group: 'loading',
    emoji: '🚜',
    keywords: ['трактор', 'мтз', 'беларус', 'юмз'],
  },

  // 4. Грузовой транспорт и перевозка
  {
    slug: 'dump-trucks',
    name: 'Самосвалы',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['самосвал', 'камаз', 'тонар', 'howo', 'хово', 'shacman', 'шакман'],
  },
  {
    slug: 'lowboys',
    name: 'Тралы и низкорамники',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['трал', 'низкорамн', 'негабарит'],
    priority: 3,
  },
  {
    slug: 'flatbeds',
    name: 'Бортовые машины и шаланды',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['шаланд', 'бортов', 'длинномер', 'бортовая машина'],
  },
  {
    slug: 'tractor-units',
    name: 'Тягачи и полуприцепы',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['тягач', 'полуприцеп', 'седельн', 'фура'],
  },
  {
    slug: 'tow-trucks',
    name: 'Эвакуаторы',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['эвакуатор'],
  },
  {
    slug: 'special-trailers',
    name: 'Зерновозы и спецприцепы',
    group: 'hauling',
    emoji: '🚛',
    keywords: ['зерновоз', 'спецприцеп', 'прицеп', 'цементовоз', 'муковоз'],
  },

  // 5. Дорожно-строительная техника
  {
    slug: 'rollers',
    name: 'Катки',
    group: 'road',
    emoji: '🛣️',
    keywords: ['виброкат', 'каток', 'катка', 'катки', 'катком', 'катку', 'катков'],
  },
  {
    slug: 'pavers',
    name: 'Асфальтоукладчики',
    group: 'road',
    emoji: '🛣️',
    keywords: ['асфальтоукладчик', 'укладчик асфальт', 'асфальтоукладч'],
  },
  {
    slug: 'milling-machines',
    name: 'Фрезы дорожные',
    group: 'road',
    emoji: '🛣️',
    keywords: ['дорожная фреза', 'фреза', 'фрезы', 'фрезерован'],
  },
  {
    slug: 'bitumen-sprayers',
    name: 'Автогудронаторы',
    group: 'road',
    emoji: '🛣️',
    keywords: ['гудронатор', 'автогудронатор', 'битум'],
  },
  {
    slug: 'road-marking',
    name: 'Дорожные щётки и разметочные машины',
    group: 'road',
    emoji: '🛣️',
    keywords: ['разметочн', 'разметк', 'дорожная щетка', 'щетка', 'щетки'],
  },

  // 6. Бетон и растворы
  {
    slug: 'mixer-trucks',
    name: 'Автобетоносмесители (миксеры)',
    group: 'concrete',
    emoji: '🧱',
    keywords: ['миксер', 'бетоносмесител', 'автобетоносмесител', 'бетоновоз', 'доставка бетона'],
  },
  {
    slug: 'concrete-pumps',
    name: 'Автобетононасосы',
    group: 'concrete',
    emoji: '🧱',
    keywords: ['бетононасос', 'автобетононасос'],
    priority: 1,
  },
  {
    slug: 'mortar-pumps',
    name: 'Растворонасосы и штукатурные станции',
    group: 'concrete',
    emoji: '🧱',
    keywords: ['растворонасос', 'штукатурн', 'растворный узел'],
  },

  // 7. Бурение, сваи, грунт
  {
    slug: 'augers',
    name: 'Ямобуры',
    group: 'drilling',
    emoji: '🕳️',
    keywords: ['ямобур', 'бурильно-кранов', 'бкм', 'ямобура'],
    priority: 2,
  },
  {
    slug: 'drilling-rigs',
    name: 'Буровые установки',
    group: 'drilling',
    emoji: '🕳️',
    keywords: ['буров', 'бурен', 'скважин', 'бурильн'],
  },
  {
    slug: 'pile-drivers',
    name: 'Сваебойные установки и копры',
    group: 'drilling',
    emoji: '🕳️',
    keywords: ['сваебой', 'сваебойн', 'копер', 'копр', 'забивка свай', 'свай', 'сваи'],
    priority: 1,
  },
  {
    slug: 'attachments',
    name: 'Гидромолоты и виброплиты (навесное)',
    group: 'drilling',
    emoji: '🔨',
    keywords: ['виброплит', 'вибротрамбовк', 'навесн', 'гидробур'],
  },

  // 8. Коммунальная и уборочная техника
  {
    slug: 'vacuum-trucks',
    name: 'Илососы и вакуумные машины',
    group: 'municipal',
    emoji: '💧',
    keywords: ['илосос', 'вакуумн', 'ассенизатор', 'ассениз', 'ко-5', 'откачк'],
  },
  {
    slug: 'water-trucks',
    name: 'Водовозы и поливомоечные',
    group: 'municipal',
    emoji: '💧',
    keywords: ['водовоз', 'поливомоечн', 'поливалк', 'цистерн', 'доставка воды'],
  },
  {
    slug: 'snow-removal',
    name: 'Снегоуборочная техника',
    group: 'municipal',
    emoji: '❄️',
    keywords: ['снегоуборочн', 'снегоуборщик', 'шнекоротор', 'снегопогрузчик'],
    priority: 1,
  },
  {
    slug: 'garbage-trucks',
    name: 'Мусоровозы и бункеровозы',
    group: 'municipal',
    emoji: '🗑️',
    keywords: ['мусоровоз', 'бункеровоз', 'бункер'],
  },
  {
    slug: 'sweepers',
    name: 'Подметальные машины',
    group: 'municipal',
    emoji: '🧹',
    keywords: ['подметальн', 'подметально-уборочн', 'вакуумная подметальн'],
    priority: 1,
  },

  // 9. Энергия и оборудование
  {
    slug: 'generators',
    name: 'Дизельные генераторы',
    group: 'equipment',
    emoji: '⚡',
    keywords: ['генератор', 'дизель-генератор', 'дгу', 'электростанци'],
  },
  {
    slug: 'compressors',
    name: 'Компрессоры',
    group: 'equipment',
    emoji: '⚡',
    keywords: ['компрессор', 'отбойн'],
  },
  {
    slug: 'lighting-heating',
    name: 'Осветительные мачты и тепловые пушки',
    group: 'equipment',
    emoji: '💡',
    keywords: ['осветительн', 'мачта', 'мачты', 'тепловая пушка', 'теплопушк', 'тепловые пушки'],
  },
  {
    slug: 'cabins',
    name: 'Бытовки и блок-контейнеры',
    group: 'equipment',
    emoji: '🏠',
    keywords: ['бытовк', 'блок-контейнер', 'вагон-дом', 'вагон-бытовк', 'модульное здание'],
  },

  // 10. Сельхоз и лесная техника
  {
    slug: 'farm-tractors',
    name: 'Сельхозтракторы и навесное',
    group: 'agri-forestry',
    emoji: '🌾',
    keywords: ['сельхозтрактор', 'плуг', 'культиватор', 'сеялк', 'косилк', 'пресс-подборщик'],
  },
  {
    slug: 'harvesters',
    name: 'Комбайны',
    group: 'agri-forestry',
    emoji: '🌾',
    keywords: ['комбайн', 'жатка', 'уборка урожая'],
  },
  {
    slug: 'forestry',
    name: 'Лесозаготовительная техника (харвестеры, форвардеры)',
    group: 'agri-forestry',
    emoji: '🌲',
    keywords: ['харвестер', 'форвардер', 'лесозаготов', 'лесовоз', 'мульчер'],
  },
];

const BY_SLUG = new Map(CATEGORIES.map((category) => [category.slug, category]));
const BY_NAME = new Map(CATEGORIES.map((category) => [category.name.toLowerCase(), category]));
const GROUP_BY_SLUG = new Map<string, CategoryGroup>(
  CATEGORY_GROUPS.map((group) => [group.slug, group]),
);

export function categoryBySlug(slug: string | null | undefined): CategoryDef | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** The category with exactly this name (case-insensitive), e.g. from a database row. */
export function categoryByName(name: string | null | undefined): CategoryDef | undefined {
  return name ? BY_NAME.get(name.trim().toLowerCase()) : undefined;
}

export function categoryGroupBySlug(slug: string | null | undefined): CategoryGroup | undefined {
  return slug ? GROUP_BY_SLUG.get(slug) : undefined;
}

/** The group of a category, by its slug or (failing that) its exact name. */
export function categoryGroupOf(category: {
  slug?: string | null;
  name?: string | null;
}): CategoryGroup | undefined {
  const def = categoryBySlug(category.slug) ?? categoryByName(category.name);
  return def ? GROUP_BY_SLUG.get(def.group) : undefined;
}

/** Display name of a category by slug; the slug itself when unknown. */
export function categoryName(slug: string): string {
  return BY_SLUG.get(slug)?.name ?? slug;
}

/**
 * The emoji of a category, by slug or exact name; undefined when the category
 * is not in this list (callers fall back to their own regex).
 */
export function categoryEmoji(category: {
  slug?: string | null;
  name?: string | null;
}): string | undefined {
  const def = categoryBySlug(category.slug) ?? categoryByName(category.name);
  return def?.emoji;
}

export function isPopularCategory(slug: string | null | undefined): boolean {
  return Boolean(slug && POPULAR_CATEGORY_SLUGS.includes(slug));
}

/**
 * Position of a category in this file's order (group by group), for sorting
 * database rows the way the pickers show them. Unknown slugs sort last.
 */
export function categoryOrder(slug: string | null | undefined): number {
  const index = slug ? CATEGORIES.findIndex((category) => category.slug === slug) : -1;
  return index === -1 ? CATEGORIES.length : index;
}

export interface CategoryGroupRows<T> {
  group: CategoryGroup;
  categories: T[];
}

const OTHER_GROUP: CategoryGroup = { slug: 'other', name: 'Другая техника', emoji: '🛠️' };

/**
 * Category rows (from the database or the API) arranged by group in this
 * file's order. Rows without a known group go under «Другая техника» last;
 * empty groups are left out.
 */
export function groupCategoryRows<T extends { slug?: string | null; name: string }>(
  rows: readonly T[],
): CategoryGroupRows<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const group = categoryGroupOf(row) ?? OTHER_GROUP;
    const bucket = buckets.get(group.slug) ?? [];
    bucket.push(row);
    buckets.set(group.slug, bucket);
  }
  const bySlugOrder = (a: T, b: T) =>
    categoryOrder(a.slug) - categoryOrder(b.slug) || a.name.localeCompare(b.name, 'ru');
  const result: CategoryGroupRows<T>[] = [];
  for (const group of [...CATEGORY_GROUPS, OTHER_GROUP]) {
    const bucket = buckets.get(group.slug);
    if (bucket && bucket.length > 0) {
      result.push({ group, categories: [...bucket].sort(bySlugOrder) });
    }
  }
  return result;
}

// JavaScript's \b only knows Latin letters, so a Cyrillic word start is
// written out: the previous character is not a letter or digit.
const W = '[a-zа-я0-9]';
const WORD_START = `(?<!${W})`;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lower case, ё → е, single spaces: the form keywords are written in. */
export function normalizeKeywordText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const KEYWORD_PATTERNS = CATEGORIES.map((category) => ({
  category,
  pattern: new RegExp(
    `${WORD_START}(?:${category.keywords.map((keyword) => escapeRegExp(normalizeKeywordText(keyword))).join('|')})`,
  ),
}));

/**
 * Which category a free-text message is about, by keywords: the category with
 * the highest priority among those that match, ties going to the one whose
 * matched keyword is the longest (then this file's order). Undefined when no
 * keyword matches.
 */
export function detectCategory(text: string): CategoryDef | undefined {
  const normalized = normalizeKeywordText(text);
  let best: { category: CategoryDef; priority: number; length: number } | undefined;
  for (const { category, pattern } of KEYWORD_PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const candidate = { category, priority: category.priority ?? 0, length: match[0].length };
    if (
      !best ||
      candidate.priority > best.priority ||
      (candidate.priority === best.priority && candidate.length > best.length)
    ) {
      best = candidate;
    }
  }
  return best?.category;
}

export function detectCategorySlug(text: string): string | undefined {
  return detectCategory(text)?.slug;
}

/** All category slugs, for schemas that enumerate them. */
export const CATEGORY_SLUGS = CATEGORIES.map((category) => category.slug) as [string, ...string[]];
