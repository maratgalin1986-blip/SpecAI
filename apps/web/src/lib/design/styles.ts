import type { Budget, DesignStyle, Roof, RoomKind } from '@/lib/design/types';

// The style dictionary: palettes, finishing tones, lighting and furniture
// principles of six interior/exterior styles, and the finishing materials
// of each room group at three budget levels. The style board of a design
// project is assembled from here; nothing is invented at run time.

export interface Swatch {
  name: string;
  hex: string;
}

export interface StyleDef {
  id: DesignStyle;
  title: string;
  mood: string;
  /** Four base colours; the fifth (accent) is picked by the seed. */
  palette: [Swatch, Swatch, Swatch, Swatch];
  accents: Swatch[];
  roof: Roof;
  facade: string;
  /** Window width of living rooms, m, and the height of all windows. */
  window: { width: number; height: number };
  tones: { floor: string; wall: string; tile: string };
  lighting: string;
  /** Colour temperature of the general light. */
  kelvin: string;
  furniture: string;
  /** Ceiling of dry rooms that replaces the budget default, if any. */
  ceiling?: string;
}

export const STYLES: Record<DesignStyle, StyleDef> = {
  scandi: {
    id: 'scandi',
    title: 'Скандинавский',
    mood: 'Светло, тепло и просто: белые стены, светлое дерево, текстиль',
    palette: [
      { name: 'Тёплый белый', hex: '#F4F1EA' },
      { name: 'Светлый дуб', hex: '#D8C3A0' },
      { name: 'Серый туман', hex: '#B9BDBF' },
      { name: 'Графит', hex: '#3C4043' },
    ],
    accents: [
      { name: 'Шалфей', hex: '#9DB39A' },
      { name: 'Пыльно-голубой', hex: '#8FA9BF' },
      { name: 'Терракота', hex: '#C97B5A' },
    ],
    roof: 'gable',
    facade: 'Двускатная кровля, фасадная доска или фиброцемент, белые откосы',
    window: { width: 1.4, height: 1.5 },
    tones: { floor: 'светлый дуб', wall: 'тёплый белый матовый', tile: 'белый матовый и терраццо' },
    lighting: 'Подвесные светильники над столом, бра у кровати, торшер в зоне чтения',
    kelvin: '2700–3000 K',
    furniture: 'Мебель на ножках, минимум декора, живые растения, шерстяной текстиль',
  },
  loft: {
    id: 'loft',
    title: 'Лофт',
    mood: 'Индустриальный характер: кирпич, бетон, чёрный металл, открытые коммуникации',
    palette: [
      { name: 'Бетон', hex: '#A7A6A2' },
      { name: 'Кирпич', hex: '#9A4E3A' },
      { name: 'Чёрный металл', hex: '#1F1F1F' },
      { name: 'Тёмный дуб', hex: '#5B4636' },
    ],
    accents: [
      { name: 'Горчица', hex: '#C9A227' },
      { name: 'Бутылочный', hex: '#2F4F3E' },
      { name: 'Медь', hex: '#B87333' },
    ],
    roof: 'flat',
    facade: 'Плоская кровля с парапетом, клинкер или металл, большие окна в чёрных рамах',
    window: { width: 1.8, height: 1.8 },
    tones: {
      floor: 'тёмный состаренный дуб',
      wall: 'кирпич на акцентной стене, остальное «под бетон»',
      tile: 'серый «под бетон»',
    },
    lighting: 'Трековые системы на чёрной шине, лампы Эдисона над столом, споты на балках',
    kelvin: '3000 K',
    furniture:
      'Открытая планировка, стеллажи из металла и дерева, кожаный диван, перегородки в чёрном профиле',
    ceiling: 'Открытые балки и коммуникации, покраска в графит',
  },
  modern: {
    id: 'modern',
    title: 'Современный',
    mood: 'Чистые линии, большие окна, сдержанные нейтральные цвета',
    palette: [
      { name: 'Белый', hex: '#F7F7F5' },
      { name: 'Светло-серый', hex: '#D9D9D6' },
      { name: 'Ясень серый', hex: '#A39C91' },
      { name: 'Антрацит', hex: '#2E3236' },
    ],
    accents: [
      { name: 'Сине-стальной', hex: '#3E5C76' },
      { name: 'Оливковый', hex: '#7A7F4A' },
      { name: 'Охра', hex: '#C8913B' },
    ],
    roof: 'flat',
    facade: 'Плоская или односкатная кровля, штукатурка и планкен, панорамное остекление',
    window: { width: 2.0, height: 1.8 },
    tones: { floor: 'серый ясень', wall: 'светло-серый', tile: 'антрацит и светлый бетон' },
    lighting: 'Линейные светильники, скрытая подсветка ниш, точечный свет по зонам',
    kelvin: '3000–3500 K',
    furniture: 'Встроенные системы хранения, модульный диван, остров на кухне',
  },
  classic: {
    id: 'classic',
    title: 'Классика',
    mood: 'Симметрия, молдинги, благородное дерево и мрамор',
    palette: [
      { name: 'Слоновая кость', hex: '#F2EADB' },
      { name: 'Беж', hex: '#D9C6A5' },
      { name: 'Светлый мрамор', hex: '#E6E2DC' },
      { name: 'Орех', hex: '#6B4A33' },
    ],
    accents: [
      { name: 'Оливковый', hex: '#7D7B4F' },
      { name: 'Бордо', hex: '#6E2A35' },
      { name: 'Глубокий синий', hex: '#253B5B' },
    ],
    roof: 'hip',
    facade: 'Вальмовая кровля, штукатурка с рустом, наличники, симметричные окна',
    window: { width: 1.3, height: 1.6 },
    tones: {
      floor: 'орех, укладка ёлочкой',
      wall: 'бежевый с молдингами',
      tile: 'светлый мрамор',
    },
    lighting: 'Центральная люстра, парные бра, настольные лампы с абажуром',
    kelvin: '2700 K',
    furniture:
      'Симметричная расстановка вокруг оси (камин, окно), мягкая мебель с каретной стяжкой',
  },
  eco: {
    id: 'eco',
    title: 'Эко',
    mood: 'Натуральные материалы, природные цвета, много света и зелени',
    palette: [
      { name: 'Лён', hex: '#E9E1D0' },
      { name: 'Песок', hex: '#CDB892' },
      { name: 'Натуральный дуб', hex: '#B08A5B' },
      { name: 'Мох', hex: '#6E7B4F' },
    ],
    accents: [
      { name: 'Глина', hex: '#B5703E' },
      { name: 'Шалфей', hex: '#9DB39A' },
      { name: 'Небо', hex: '#A7C4D2' },
    ],
    roof: 'gable',
    facade: 'Двускатная кровля, клеёный брус или имитация бруса, природный камень на цоколе',
    window: { width: 1.5, height: 1.6 },
    tones: {
      floor: 'натуральный дуб под маслом',
      wall: 'глиняная штукатурка, песочный',
      tile: 'песочный «под камень»',
    },
    lighting: 'Светильники из ротанга и дерева, тёплый рассеянный свет, подсветка растений',
    kelvin: '2700 K',
    furniture: 'Мебель из массива, плетёные элементы, лён и хлопок, зелёная стена или фитолампы',
    ceiling: 'Деревянная вагонка под маслом',
  },
  minimal: {
    id: 'minimal',
    title: 'Минимализм',
    mood: 'Ничего лишнего: монохром, скрытые системы хранения, свободные поверхности',
    palette: [
      { name: 'Белый', hex: '#FAFAFA' },
      { name: 'Светло-серый', hex: '#E4E4E2' },
      { name: 'Беленый дуб', hex: '#DCCFB8' },
      { name: 'Чёрный', hex: '#151515' },
    ],
    accents: [
      { name: 'Серо-бежевый', hex: '#BFB5A8' },
      { name: 'Холодный синий', hex: '#5D7A99' },
      { name: 'Оливка', hex: '#8A8D6B' },
    ],
    roof: 'flat',
    facade: 'Плоская кровля, гладкая белая штукатурка, окна без переплётов',
    window: { width: 1.8, height: 1.7 },
    tones: {
      floor: 'беленый дуб без фаски',
      wall: 'белый, теневой профиль у пола',
      tile: 'белый крупный формат',
    },
    lighting: 'Скрытые линии света в потолке, трековые споты, без люстр',
    kelvin: '3000 K',
    furniture: 'Мебель в цвет стен, двери скрытого монтажа, шкафы до потолка без ручек',
  },
};

export const STYLE_IDS = Object.keys(STYLES) as DesignStyle[];

export const BUDGETS: Record<Budget, { title: string; hint: string }> = {
  econom: { title: 'Эконом', hint: 'Практично и недорого' },
  mid: { title: 'Средний', hint: 'Баланс цены и качества' },
  premium: { title: 'Премиум', hint: 'Натуральные материалы, умный свет' },
};

export type FinishGroup = 'dry' | 'kitchen' | 'wet' | 'steam' | 'hall' | 'tech' | 'garage';

export const FINISH_GROUP: Record<RoomKind, FinishGroup> = {
  living: 'kitchen',
  bedroom: 'dry',
  kids: 'dry',
  cabinet: 'dry',
  rest: 'dry',
  studio: 'dry',
  bath: 'wet',
  wc: 'wet',
  wash: 'wet',
  steam: 'steam',
  hall: 'hall',
  vestibule: 'hall',
  stair: 'hall',
  storage: 'tech',
  boiler: 'tech',
  wardrobe: 'tech',
  garage: 'garage',
  workshop: 'garage',
};

type Tri = Record<Budget, string>;
interface Base {
  floor: Tri;
  walls: Tri;
  ceiling: Tri;
  /** Whether the style tone is added to the floor / the walls. */
  tone: { floor: 'floor' | 'tile' | null; walls: 'wall' | 'tile' | null };
}

const DRY_CEILING: Tri = {
  econom: 'Натяжной матовый',
  mid: 'ГКЛ под покраску',
  premium: 'ГКЛ с теневым швом и скрытым карнизом',
};

export const FINISH_BASE: Record<FinishGroup, Base> = {
  dry: {
    floor: {
      econom: 'Ламинат 32 класса',
      mid: 'Ламинат 33 класса или кварцвинил',
      premium: 'Инженерная доска',
    },
    walls: {
      econom: 'Обои под покраску',
      mid: 'Моющаяся матовая краска по шпаклёвке',
      premium: 'Декоративная штукатурка',
    },
    ceiling: DRY_CEILING,
    tone: { floor: 'floor', walls: 'wall' },
  },
  kitchen: {
    floor: {
      econom: 'Кварцвинил по всей площади',
      mid: 'Керамогранит в кухонной зоне, ламинат в гостиной',
      premium: 'Керамогранит 60×120 в кухне, инженерная доска в гостиной',
    },
    walls: {
      econom: 'Моющаяся краска, фартук — плитка',
      mid: 'Краска по шпаклёвке, фартук — керамогранит',
      premium: 'Декоративная штукатурка, фартук — слэб керамогранита',
    },
    ceiling: DRY_CEILING,
    tone: { floor: 'floor', walls: 'wall' },
  },
  wet: {
    floor: {
      econom: 'Керамическая плитка 30×30',
      mid: 'Керамогранит 60×60, тёплый пол',
      premium: 'Керамогранит 60×120, тёплый пол, трап',
    },
    walls: {
      econom: 'Керамическая плитка 20×30',
      mid: 'Керамогранит 30×60',
      premium: 'Крупноформатный керамогранит и микроцемент',
    },
    ceiling: {
      econom: 'Натяжной глянцевый',
      mid: 'Реечный алюминиевый',
      premium: 'Влагостойкий ГКЛ под покраску',
    },
    tone: { floor: 'tile', walls: 'tile' },
  },
  steam: {
    floor: {
      econom: 'Плитка, деревянные трапики',
      mid: 'Керамогранит, трапики из липы',
      premium: 'Керамогранит с подогревом, трапики из абаша',
    },
    walls: {
      econom: 'Вагонка осина, фольгированный утеплитель',
      mid: 'Вагонка липа, фольгированный утеплитель',
      premium: 'Абаш или канадский кедр, гималайская соль',
    },
    ceiling: {
      econom: 'Вагонка осина',
      mid: 'Вагонка липа',
      premium: 'Вагонка абаш',
    },
    tone: { floor: null, walls: null },
  },
  hall: {
    floor: {
      econom: 'Коммерческий линолеум',
      mid: 'Керамогранит у входа, дальше ламинат',
      premium: 'Керамогранит или натуральный камень',
    },
    walls: {
      econom: 'Флизелиновые обои',
      mid: 'Моющаяся краска',
      premium: 'Стеновые панели и краска',
    },
    ceiling: DRY_CEILING,
    tone: { floor: null, walls: 'wall' },
  },
  tech: {
    floor: {
      econom: 'Линолеум',
      mid: 'Керамическая плитка',
      premium: 'Керамогранит',
    },
    walls: {
      econom: 'Краска по штукатурке',
      mid: 'Моющаяся краска',
      premium: 'Моющаяся краска',
    },
    ceiling: {
      econom: 'Краска по штукатурке',
      mid: 'Краска по шпаклёвке',
      premium: 'ГКЛ под покраску',
    },
    tone: { floor: null, walls: null },
  },
  garage: {
    floor: {
      econom: 'Бетонная стяжка с упрочнителем',
      mid: 'Полимерный наливной пол',
      premium: 'Полимерный пол с кварцевой посыпкой',
    },
    walls: {
      econom: 'Штукатурка, краска',
      mid: 'Штукатурка, моющаяся краска',
      premium: 'Стеновые панели, перфопанели для инструмента',
    },
    ceiling: {
      econom: 'Без отделки, огнезащитная пропитка',
      mid: 'Покраска по огнезащите',
      premium: 'ГКЛ огнестойкий, линейные светильники',
    },
    tone: { floor: null, walls: null },
  },
};

export interface Finish {
  floor: string;
  walls: string;
  ceiling: string;
}

/** Floor, walls and ceiling of a room of this kind in a style and budget. */
export function finishFor(kind: RoomKind, style: DesignStyle, budget: Budget): Finish {
  const group = FINISH_GROUP[kind];
  const base = FINISH_BASE[group];
  const s = STYLES[style];
  const toned = (text: string, tone: 'floor' | 'wall' | 'tile' | null) =>
    tone ? `${text}, ${s.tones[tone]}` : text;
  const dryCeiling = (group === 'dry' || group === 'kitchen') && s.ceiling && budget !== 'econom';
  return {
    floor: toned(base.floor[budget], base.tone.floor),
    walls: toned(base.walls[budget], base.tone.walls),
    ceiling: dryCeiling ? s.ceiling! : base.ceiling[budget],
  };
}

export const LIGHTING_BUDGET: Record<Budget, string> = {
  econom: 'Общий свет и 1 сценарий, выключатели у входа',
  mid: 'Общий и локальный свет, 2–3 сценария, диммер в гостиной',
  premium: 'Умный дом: сценарии «день», «вечер», «кино», «ночь», датчики движения в коридорах',
};

export function lightingFor(style: DesignStyle, budget: Budget): string[] {
  const s = STYLES[style];
  return [`${s.lighting}.`, `Цветовая температура ${s.kelvin}.`, `${LIGHTING_BUDGET[budget]}.`];
}

/** Furniture zoning rules of each room kind (ergonomics, not style). */
export const FURNITURE: Record<RoomKind, string> = {
  living:
    'Рабочий треугольник «мойка — плита — холодильник», проход у кухни от 1,2 м; обеденный стол у окна; диван спинкой к проходу, ТВ на глухой стене',
  bedroom:
    'Кровать изголовьем к глухой стене, проходы по бокам от 0,7 м; шкаф у входа; рабочее место у окна',
  kids: 'Кровать вдоль стены, свободный центр для игр, стол у окна (свет слева для правши)',
  cabinet: 'Стол перпендикулярно окну, стеллаж на глухой стене, розетки у стола',
  bath: 'Сантехника у стояка, душ без поддона с трапом или ванна вдоль короткой стены; дверь открывается наружу',
  wc: 'Инсталляция у стояка, раковина 40–45 см; дверь открывается наружу',
  hall: 'Шкаф глубиной 60 см у входа, банкетка, зеркало в полный рост; ширина прохода от 1,0 м',
  stair: 'Марш шириной от 0,9 м, ступень 28–30 см, подступенок 16–18 см, ограждение 0,9 м',
  storage: 'Стеллажи вдоль стен на всю высоту',
  boiler: 'Котёл на негорючей стене, окно с форточкой, вентиляция и отдельный ввод',
  wardrobe: 'Двусторонние стеллажи с проходом от 0,7 м, подсветка',
  steam: 'Полки в 2–3 яруса у глухой стены, печь у входа за ограждением; дверь наружу, без замков',
  wash: 'Душ, трап в полу, скамья; доступ к печи-каменке из мойки по желанию',
  rest: 'Стол с лавками у окна, вешалка у входа, зона чаепития',
  vestibule: 'Тамбур отсекает холод, вешалка и полка для обуви',
  garage: 'Проезд от ворот, 0,7 м по бокам машины, стеллажи вдоль глухой стены',
  workshop: 'Верстак у окна, перфопанель над ним, отдельная линия розеток 380 В по желанию',
  studio: 'Открытое пространство: зона отдыха у окон, рабочая зона у глухой стены',
};

export function paletteFor(style: DesignStyle, accentIndex: number): Swatch[] {
  const s = STYLES[style];
  return [...s.palette, s.accents[accentIndex % s.accents.length]!];
}
