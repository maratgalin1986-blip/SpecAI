// The «Стройка» walk-through (/stroyka): zones, characters and the dialogue
// graph. Pure data, shared by the film tour and the tests.

import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { SITE } from '@/lib/site';
import { MACHINE_WORKS } from '@/lib/machineWorks';
import { CRANE_HEAVY_RATE, HAMMER_RATE, RATES, rub, SHIFT_HOURS } from '@/lib/prices';
import type { LiftStop } from '@/lib/stroykaSky';
import type { ContextSet } from '@/lib/stroyka/context';

export type ZoneId =
  | 'gate'
  | 'kotlovan'
  | 'planirovka'
  | 'doroga'
  | 'sklad'
  | 'korpus'
  | 'montazh'
  | 'office'
  | 'smeta';

export type SpeakerId = 'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'alsu';

export const SPEAKERS: Record<SpeakerId, { name: string; role: string }> = {
  mihalych: { name: 'Прораб Михалыч', role: 'прораб' },
  rinat: { name: 'Машинист Ринат', role: 'машинист' },
  sveta: { name: 'Логист Света', role: 'логист' },
  ildar: { name: 'Крановщик Ильдар', role: 'крановщик' },
  alsu: { name: 'Снабженец Алсу', role: 'снабженец' },
};

/**
 * The owner's hourly rates with an operator, ₽/h, from lib/prices.ts.
 * A shift is SHIFT_HOURS (8) hours.
 */
export const PRICES = {
  truck: RATES.truck,
  agp: RATES.agp,
  tractor: RATES.tractor,
  crane: RATES.crane,
  crane32: CRANE_HEAVY_RATE,
  hammer: HAMMER_RATE,
  other: RATES.backhoe,
};
export { SHIFT_HOURS };

/** Hourly rate of a machine type (the 25 t crane for `crane`). */
export function hourlyRate(type: MachineType): number {
  return MACHINE_WORKS[type]?.rate ?? PRICES.other;
}

/** 3000 → «3 000»: the site's shared formatter (lib/prices.ts). */
export { rub };

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface Zone {
  id: ZoneId;
  name: string;
  /** Who meets the visitor here. */
  speaker: SpeakerId;
  /** First line of the zone's dialogue. */
  root: string;
  center: Vec2;
  radius: number;
  /** Machines working in the zone (for the sound layer). */
  machines: MachineType[];
  /** The machine «Оформить у Светы» orders from this zone. */
  order?: MachineType;
  /** Where the NPC stands. */
  npc: Vec2;
  /** Where the camera stops on the tour / lands after a jump. */
  stand: Vec2;
  /** What the camera looks at there. */
  focus: Vec3;
  /** Tour shot: first person or over the shoulder. */
  view: 'fp' | 'tp';
}

export const ZONES: Zone[] = [
  {
    id: 'gate',
    name: 'Проходная',
    speaker: 'mihalych',
    root: 'gate',
    center: [0, 55],
    radius: 9,
    machines: [],
    npc: [3, 51],
    stand: [0, 58],
    focus: [3, 1.6, 51],
    view: 'fp',
  },
  {
    id: 'kotlovan',
    name: 'Котлован',
    speaker: 'rinat',
    root: 'kotlovan',
    center: [-22, 19],
    radius: 11,
    machines: ['backhoe', 'truck'],
    order: 'backhoe',
    npc: [-18, 15.5],
    stand: [-15, 16],
    focus: [-26, 1.2, 22],
    view: 'tp',
  },
  {
    id: 'planirovka',
    name: 'Планировка',
    speaker: 'mihalych',
    root: 'planirovka',
    center: [16, 9],
    radius: 9,
    machines: ['dozer', 'tractor'],
    order: 'dozer',
    npc: [11, 13],
    stand: [14, 15],
    focus: [18, 1, 5],
    view: 'fp',
  },
  {
    id: 'doroga',
    name: 'Дорога',
    speaker: 'rinat',
    root: 'doroga',
    center: [-28, -8],
    radius: 10,
    machines: ['roller', 'truck'],
    order: 'roller',
    npc: [-20, -6],
    stand: [-24, -3],
    focus: [-32, 1, -13],
    view: 'fp',
  },
  {
    id: 'sklad',
    name: 'Склад',
    speaker: 'ildar',
    root: 'sklad',
    center: [-20, -40],
    radius: 10,
    machines: ['kmu', 'loader'],
    order: 'kmu',
    npc: [-17, -38],
    stand: [-14, -34],
    focus: [-24, 1.5, -46],
    view: 'tp',
  },
  {
    id: 'korpus',
    name: 'Объект',
    speaker: 'mihalych',
    root: 'korpus',
    center: [24, -29],
    radius: 8.5,
    machines: ['agp'],
    order: 'agp',
    npc: [25.4, -26.5],
    stand: [24, -27.5],
    focus: [24, 2.6, -40],
    view: 'fp',
  },
  {
    id: 'montazh',
    name: 'Монтаж',
    speaker: 'ildar',
    root: 'montazh',
    center: [24, 30],
    radius: 10,
    machines: ['crane'],
    order: 'crane',
    npc: [20, 27],
    stand: [17, 33],
    focus: [32, 6, 22],
    view: 'tp',
  },
  {
    id: 'office',
    name: 'Прорабская',
    speaker: 'sveta',
    root: 'sveta',
    center: [13, 47],
    radius: 6,
    machines: [],
    npc: [14, 49.5],
    stand: [10, 45],
    focus: [14, 1.5, 49.5],
    view: 'fp',
  },
  {
    id: 'smeta',
    name: 'Сметный отдел',
    speaker: 'alsu',
    root: 'smeta',
    center: [-15, 44],
    radius: 6.5,
    machines: [],
    npc: [-15.5, 46.6],
    stand: [-11.5, 41.5],
    focus: [-17, 1.6, 48.5],
    view: 'fp',
  },
];

export function zoneById(id: ZoneId): Zone {
  const zone = ZONES.find((z) => z.id === id);
  if (!zone) throw new Error(`Unknown zone ${id}`);
  return zone;
}

// ---------------------------------------------------------------- dialogue

export type ReplyAction =
  | { kind: 'link'; href: string }
  | { kind: 'goto'; node: string }
  | { kind: 'zone'; zone: ZoneId }
  /** Go to the zone where the machine from the conversation works. */
  | { kind: 'show' }
  | { kind: 'next' }
  /** Pass the visitor to Света over the radio and open the order form. */
  | { kind: 'form' };

export interface Reply {
  label: string;
  action: ReplyAction;
  primary?: boolean;
  /** Fields of the conversation this answer fills in. */
  set?: ContextSet;
}

export interface DialogNode {
  id: string;
  speaker: SpeakerId;
  text: string;
  replies: Reply[];
  /** Shows the callback form under the line. */
  form?: boolean;
}

export const CALL: Reply = {
  label: 'Позвонить диспетчеру',
  action: { kind: 'link', href: SITE.phoneHref },
};
const NEXT: Reply = { label: 'Дальше по объекту', action: { kind: 'next' } };

/** The wizard on the home page for a machine, with its jobs («Подробнее о технике»). */
export function orderHref(type: MachineType): string {
  return `/?m=${type}#podbor`;
}

/**
 * The amber order button of a zone: Света takes the order right here, in the
 * film (the form under her line), with the machine already filled in.
 */
export function orderReply(type: MachineType, label = ORDER_LABEL): Reply {
  return { label, action: { kind: 'form' }, primary: true, set: { machine: type } };
}
export const ORDER_LABEL = 'Оформить у Светы';

/** A second machine of the zone: also to Света, not amber. */
function alsoOrder(type: MachineType, label: string): Reply {
  return { label, action: { kind: 'form' }, set: { machine: type } };
}

/** The wizard (another page) as the secondary way: «Подробнее о технике». */
function moreAbout(type: MachineType): Reply {
  return { label: 'Подробнее о технике', action: { kind: 'link', href: orderHref(type) } };
}
const when = (node: string): Reply[] => [
  { label: 'Сегодня', action: { kind: 'goto', node }, set: { when: 'сегодня' } },
  { label: 'Завтра', action: { kind: 'goto', node }, set: { when: 'завтра' } },
  { label: 'На этой неделе', action: { kind: 'goto', node }, set: { when: 'эту неделю' } },
];

/**
 * A price as the site says it everywhere on /stroyka: «от 4 000 ₽/ч с
 * машинистом» (no-break spaces, so it never splits after «от» or the digits).
 */
export const P = (value: number) => `от\u00a0${rub(value)}\u00a0₽/ч с\u00a0машинистом`;

/** «От 3 500 ₽/ч с машинистом» at the start of a sentence. */
const capitalP = (value: number) => `О${P(value).slice(1)}`;

/** The next stop of the walk (the order of ZONES, round). */
export function nextZone(zone: ZoneId): ZoneId {
  const i = ZONES.findIndex((z) => z.id === zone);
  return ZONES[(i + 1) % ZONES.length]!.id;
}

export const DIALOGUE: Record<string, DialogNode> = {
  gate: {
    id: 'gate',
    speaker: 'mihalych',
    text: 'Здорово! Ты по делу? Говори, что строим — подскажу, какая техника нужна.',
    replies: [
      { label: 'Копать котлован или траншею', action: { kind: 'goto', node: 'gate-dig' } },
      { label: 'Поднять груз или фасад', action: { kind: 'goto', node: 'gate-lift' } },
      { label: 'Площадка, дорога, снег', action: { kind: 'goto', node: 'gate-ground' } },
      { label: 'Сразу к заказу', action: { kind: 'form' }, primary: true },
    ],
  },
  'gate-dig': {
    id: 'gate-dig',
    speaker: 'mihalych',
    text: `Под фундамент или под трубы? Экскаватор-погрузчик — ${P(PRICES.other)}, для большого котлована есть гусеничный.`,
    replies: [
      {
        label: 'Котлован под фундамент',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'котлован под фундамент', machine: 'backhoe' },
      },
      {
        label: 'Траншея под трубы',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'траншея под коммуникации', machine: 'backhoe' },
      },
      {
        label: 'Большой котлован',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'большой котлован', machine: 'excavator' },
      },
    ],
  },
  'gate-lift': {
    id: 'gate-lift',
    speaker: 'mihalych',
    text: `Плиты и фермы — автокран, ${P(PRICES.crane)}. Фасад, окна, вывески — автовышка, ${P(PRICES.agp)}. Блоки с машины — манипулятор.`,
    replies: [
      {
        label: 'Плиты, фермы',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'монтаж плит', machine: 'crane' },
      },
      {
        label: 'Фасад, окна',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'работы на фасаде', machine: 'agp' },
      },
      {
        label: 'Разгрузить блоки',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'разгрузка блоков', machine: 'kmu' },
      },
    ],
  },
  'gate-ground': {
    id: 'gate-ground',
    speaker: 'mihalych',
    text: `Выровнять площадку — бульдозер. Щебень — самосвал, ${P(PRICES.truck)}, и каток. Снег, покос — трактор, ${P(PRICES.tractor)}.`,
    replies: [
      {
        label: 'Выровнять площадку',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'планировка участка', machine: 'dozer' },
      },
      {
        label: 'Дорога: щебень и каток',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'отсыпка и укатка дороги', machine: 'roller' },
      },
      {
        label: 'Снег или покос',
        action: { kind: 'goto', node: 'gate-when' },
        set: { task: 'уборка снега или покос', machine: 'tractor' },
      },
    ],
  },
  'gate-when': {
    id: 'gate-when',
    speaker: 'mihalych',
    text: '{task} — понял. Когда нужна техника?',
    replies: when('gate-next'),
  },
  'gate-next': {
    id: 'gate-next',
    speaker: 'mihalych',
    text: 'Значит, так: {facts}. У СпецПласт16 такая машина есть — покажу её в работе или сразу передам Свете, она оформит.',
    replies: [
      { label: 'Показать технику', action: { kind: 'show' } },
      { label: 'Передать Свете', action: { kind: 'form' }, primary: true },
      CALL,
    ],
  },
  kotlovan: {
    id: 'kotlovan',
    speaker: 'rinat',
    text: `Котлован под фундамент? Траншея под трубы? Обычно управляемся за смену, если грунт без сюрпризов. Экскаватор-погрузчик — ${P(PRICES.other)}.`,
    replies: [orderReply('backhoe'), moreAbout('backhoe'), CALL, NEXT],
  },
  planirovka: {
    id: 'planirovka',
    speaker: 'mihalych',
    text: `Площадку выровнять, грунт растолкать — бульдозер, ${P(PRICES.other)}. Снег, покос, прицеп — трактор, ${P(PRICES.tractor)}.`,
    replies: [orderReply('dozer'), alsoOrder('tractor', 'Нужен трактор'), moreAbout('dozer'), NEXT],
  },
  doroga: {
    id: 'doroga',
    speaker: 'rinat',
    text: `Щебень самосвалом подвезём — ${P(PRICES.truck)}, катком прикатаем — ${P(PRICES.other)}. Слышите, пищит? Это самосвал сдаёт задом.`,
    replies: [
      orderReply('roller'),
      alsoOrder('truck', 'Нужен самосвал'),
      moreAbout('roller'),
      NEXT,
    ],
  },
  sklad: {
    id: 'sklad',
    speaker: 'ildar',
    text: `Блоки с машины снять, поддоны раскидать — манипулятор КМУ или фронтальный погрузчик. Оба — ${P(PRICES.other)}, смена — ${SHIFT_HOURS} часов.`,
    replies: [orderReply('kmu'), alsoOrder('loader', 'Нужен погрузчик'), moreAbout('kmu'), NEXT],
  },
  korpus: {
    id: 'korpus',
    speaker: 'mihalych',
    text: `Глянь в окно — люлька поднимается. Автовышка: фасад, окна, вывески, кровля. ${capitalP(PRICES.agp)}.`,
    replies: [orderReply('agp'), moreAbout('agp'), CALL, NEXT],
  },
  montazh: {
    id: 'montazh',
    speaker: 'ildar',
    text: `Плиту на место — аккуратно, без рывков. Тут я на башенном, а к тебе приедет автокран: 25 т — ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}. Гидромолот, если надо, — ${P(PRICES.hammer)}.`,
    replies: [orderReply('crane'), moreAbout('crane'), CALL, NEXT],
  },
  smeta: {
    id: 'smeta',
    speaker: 'alsu',
    text: 'Я Алсу, снабжение СпецПласт16. Бетон, песок, щебень, блоки — всё у нас, с доставкой нашими самосвалами. Скажите объём — посчитаю весь комплект.',
    replies: [
      orderReply('truck', 'Доставка — оформить у Светы'),
      { label: 'Смета для снабженца', action: { kind: 'link', href: '/smeta?mode=snab' } },
      { label: 'Смета для прораба', action: { kind: 'link', href: '/smeta' } },
      NEXT,
    ],
  },
  sveta: {
    id: 'sveta',
    speaker: 'sveta',
    text: 'Давайте адрес и когда нужно — поставлю машину в график. Обычно подаём в день заявки, если машина свободна.',
    form: true,
    replies: [CALL, NEXT],
  },
};

/** The zone where a machine can be seen at work. */
export const MACHINE_ZONE: Partial<Record<MachineType, ZoneId>> = {
  backhoe: 'kotlovan',
  excavator: 'kotlovan',
  'wheeled-excavator': 'kotlovan',
  crane: 'montazh',
  agp: 'korpus',
  kmu: 'sklad',
  loader: 'sklad',
  roller: 'doroga',
  truck: 'doroga',
  dozer: 'planirovka',
  tractor: 'planirovka',
};

const BOOK_TOMORROW: Reply = {
  label: 'Записать на завтра',
  action: { kind: 'form' },
  primary: true,
};

/** What the crane operator and the foreman say when lifting is stopped by the weather. */
export const LIFT_STOP_LINES: Record<
  'montazh' | 'korpus',
  Record<NonNullable<LiftStop['reason']>, string>
> = {
  montazh: {
    wind: `Ветер сильный, кран не поднимаем — запишу на завтра. Автокран 25 т — ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}.`,
    thunder: 'Гроза — кран не поднимаем, переждём. Запишу на ближайшее окно, как утихнет.',
    other: 'Погода не для подъёма — кран стоит. Запишу на ближайший нормальный день.',
  },
  korpus: {
    wind: `Ветер сильный — люльку не поднимаем, это безопасность. Автовышку запишу на завтра, ${P(PRICES.agp)}.`,
    thunder: 'Гроза — в люльку никто не полезет. Переждём и поставим на окно.',
    other: 'Погода не для работы на высоте — вышка стоит. Запишу на ближайший день.',
  },
};

/** A dialogue line, with the weather variant when lifting machines are stopped. */
export function dialogueNode(id: string, lift?: LiftStop | null): DialogNode | null {
  const node = DIALOGUE[id];
  if (!node) return null;
  if (lift?.stop && lift.reason && (id === 'montazh' || id === 'korpus')) {
    return {
      ...node,
      text: LIFT_STOP_LINES[id][lift.reason],
      replies: [BOOK_TOMORROW, CALL, NEXT],
    };
  }
  return node;
}

/** The line a reply of kind `form` opens: Света with the callback form. */
export const FORM_NODE = 'sveta';

/** The first line of a zone's dialogue. */
export function zoneDialogue(id: ZoneId): DialogNode {
  return DIALOGUE[zoneById(id).root]!;
}

/** Text the callback form starts with, so the dispatcher knows what was looked at. */
export function orderMessage(machine: MachineType | null | undefined): string {
  return machine ? `Нужен: ${MACHINE_LABELS[machine]}. ` : '';
}
