// The «Стройка» walk-through (/stroyka): zones, characters, dialogue graph,
// the tour route and the collision boxes. Pure data and maths, no three.js,
// so the same module drives the 3D world, the 2D fallback map and the tests.

import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { SITE } from '@/lib/site';
import type { LiftStop } from '@/lib/stroykaSky';
import type { ContextSet } from '@/lib/stroyka/context';

export type ZoneId =
  'gate' | 'kotlovan' | 'planirovka' | 'doroga' | 'sklad' | 'korpus' | 'montazh' | 'office';

export type SpeakerId = 'mihalych' | 'rinat' | 'sveta' | 'ildar';

export const SPEAKERS: Record<SpeakerId, { name: string; role: string }> = {
  mihalych: { name: 'Прораб Михалыч', role: 'прораб' },
  rinat: { name: 'Машинист Ринат', role: 'машинист' },
  sveta: { name: 'Логист Света', role: 'логист' },
  ildar: { name: 'Крановщик Ильдар', role: 'крановщик' },
};

/** The owner's hourly rates with an operator, ₽/h. A shift is 8 hours. */
export const PRICES = {
  truck: 2300,
  agp: 2500,
  tractor: 2500,
  crane: 3500,
  crane32: 4500,
  hammer: 3500,
  other: 3000,
} as const;
export const SHIFT_HOURS = 8;

/** Hourly rate of a machine type (the 25 t crane for `crane`). */
export function hourlyRate(type: MachineType): number {
  if (type === 'truck') return PRICES.truck;
  if (type === 'agp') return PRICES.agp;
  if (type === 'tractor') return PRICES.tractor;
  if (type === 'crane') return PRICES.crane;
  return PRICES.other;
}

/** 3000 → «3 000» with a non-breaking space, as the rest of the site prints prices. */
export function rub(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

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
  /** The machine «Оформить наряд» orders from this zone. */
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
];

export function zoneById(id: ZoneId): Zone {
  const zone = ZONES.find((z) => z.id === id);
  if (!zone) throw new Error(`Unknown zone ${id}`);
  return zone;
}

/** How much farther than its radius a zone keeps you once you are in it. */
export const ZONE_HYSTERESIS = 3;

/**
 * The zone the point (x, z) belongs to. The current zone holds a little
 * beyond its radius, so standing on the edge does not flicker the dialogue.
 */
export function detectZone(x: number, z: number, current: ZoneId | null = null): ZoneId | null {
  if (current) {
    const zone = zoneById(current);
    if (Math.hypot(x - zone.center[0], z - zone.center[1]) <= zone.radius + ZONE_HYSTERESIS) {
      return current;
    }
  }
  let best: ZoneId | null = null;
  let bestDistance = Infinity;
  for (const zone of ZONES) {
    const distance = Math.hypot(x - zone.center[0], z - zone.center[1]);
    if (distance <= zone.radius && distance < bestDistance) {
      best = zone.id;
      bestDistance = distance;
    }
  }
  return best;
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

/** «Оформить наряд» for a machine: the wizard on the home page, with its jobs. */
export function orderHref(type: MachineType): string {
  return `/?m=${type}#podbor`;
}
function order(type: MachineType, label: string): Reply {
  return {
    label,
    action: { kind: 'link', href: orderHref(type) },
    primary: true,
    set: { machine: type },
  };
}
const TO_SVETA: Reply = { label: 'Передать Свете — оформить', action: { kind: 'form' } };
const when = (node: string): Reply[] => [
  { label: 'Сегодня', action: { kind: 'goto', node }, set: { when: 'сегодня' } },
  { label: 'Завтра', action: { kind: 'goto', node }, set: { when: 'завтра' } },
  { label: 'На этой неделе', action: { kind: 'goto', node }, set: { when: 'эту неделю' } },
];

const P = (value: number) => `${rub(value)}\u00a0₽/ч`;

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
    text: `Под фундамент или под трубы? Экскаватор-погрузчик — от ${P(PRICES.other)}, для большого котлована есть гусеничный.`,
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
    text: `Плиты и фермы — автокран, от ${P(PRICES.crane)}. Фасад, окна, вывески — автовышка, от ${P(PRICES.agp)}. Блоки с машины — манипулятор.`,
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
    text: 'Значит так: {facts}. Покажу машину в работе — или сразу передам Свете, она оформит.',
    replies: [
      { label: 'Показать технику', action: { kind: 'show' } },
      { label: 'Передать Свете', action: { kind: 'form' }, primary: true },
      CALL,
    ],
  },
  kotlovan: {
    id: 'kotlovan',
    speaker: 'rinat',
    text: `Котлован под фундамент? Траншея под трубы? Мой JCB за смену сделает. От ${rub(PRICES.other)} ₽/ч с машинистом.`,
    replies: [order('backhoe', 'Нужен такой — оформить наряд'), CALL, NEXT, TO_SVETA],
  },
  planirovka: {
    id: 'planirovka',
    speaker: 'mihalych',
    text: `Площадку выровнять, грунт растолкать — бульдозер, от ${P(PRICES.other)}. Снег, покос, прицеп — трактор, от ${P(PRICES.tractor)}.`,
    replies: [
      order('dozer', 'Наряд на бульдозер'),
      order('tractor', 'Наряд на трактор'),
      NEXT,
      TO_SVETA,
    ],
  },
  doroga: {
    id: 'doroga',
    speaker: 'rinat',
    text: `Щебень самосвалом подвезём — ${P(PRICES.truck)}, катком прикатаем — ${P(PRICES.other)}. Слышишь, пищит? Это самосвал сдаёт задом.`,
    replies: [order('roller', 'Наряд на каток'), order('truck', 'Нужен самосвал'), NEXT, TO_SVETA],
  },
  sklad: {
    id: 'sklad',
    speaker: 'ildar',
    text: `Блоки с машины снять, поддоны раскидать — манипулятор КМУ или фронтальный погрузчик. Оба от ${P(PRICES.other)}, смена — ${SHIFT_HOURS} часов.`,
    replies: [
      order('kmu', 'Наряд на манипулятор'),
      order('loader', 'Наряд на погрузчик'),
      NEXT,
      TO_SVETA,
    ],
  },
  korpus: {
    id: 'korpus',
    speaker: 'mihalych',
    text: `Глянь в окно — люлька поднимается. Автовышка: фасад, окна, вывески, кровля. От ${P(PRICES.agp)} с оператором.`,
    replies: [order('agp', 'Нужна автовышка — наряд'), CALL, NEXT, TO_SVETA],
  },
  montazh: {
    id: 'montazh',
    speaker: 'ildar',
    text: `Плиту на место — аккуратно, без рывков. Автокран 25 т — от ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}. Гидромолот, если надо, — ${P(PRICES.hammer)}.`,
    replies: [order('crane', 'Оформить наряд на кран'), CALL, NEXT, TO_SVETA],
  },
  sveta: {
    id: 'sveta',
    speaker: 'sveta',
    text: 'Давай адрес и когда нужно — поставлю машину в график. Подача обычно в день заявки.',
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
    wind: `Ветер сильный, кран не поднимаем — запишу на завтра. Автокран 25 т — от ${P(PRICES.crane)}, 32 т — ${P(PRICES.crane32)}.`,
    thunder: 'Гроза — кран не поднимаем, переждём. Запишу на ближайшее окно, как утихнет.',
    other: 'Погода не для подъёма — кран стоит. Запишу на ближайший нормальный день.',
  },
  korpus: {
    wind: `Ветер сильный — люльку не поднимаем, это безопасность. Автовышку запишу на завтра, от ${P(PRICES.agp)}.`,
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

// ---------------------------------------------------------------- world

/** Where the visitor can walk (the fence is just outside). */
export const BOUNDS = { minX: -60, maxX: 60, minZ: -63, maxZ: 74 } as const;
/** The fence line; the gate is a gap in the south side at |x| < GATE_HALF. */
export const FENCE = { minX: -62, maxX: 62, minZ: -66, maxZ: 64 } as const;
export const GATE_HALF = 7;

/** Axis-aligned rectangles on the ground that block walking. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const BUILDING: Box = { minX: 14, maxX: 34, minZ: -36, maxZ: -22 };
export const DOOR = { minX: 23, maxX: 25 } as const;
export const PIT: Box = { minX: -44, maxX: -27.4, minZ: 11, maxZ: 24 };

const wall = (minX: number, maxX: number, minZ: number, maxZ: number): Box => ({
  minX,
  maxX,
  minZ,
  maxZ,
});

export const STATIC_OBSTACLES: Box[] = [
  PIT,
  // Backhoe and its dump truck.
  wall(-28.5, -19.5, 20.6, 23.4),
  wall(-30, -19.8, 24.6, 27.6),
  // Crane with outriggers, slab stack and the frame it builds.
  wall(30, 42, 18, 26),
  wall(27.3, 33.3, 24.5, 28.9),
  wall(31.5, 37.9, 10.4, 16.8),
  // Bulldozer lane and the tractor circle.
  wall(8.5, 27, 3, 7.5),
  wall(37.5, 50.5, -8.5, 4.5),
  // Roller lane, the gravel pile and the truck lane.
  wall(-35, -6, -13.7, -10.3),
  wall(-42, -33, -19, -14.6),
  // KMU truck, block stacks, front loader lane.
  wall(-34, -21, -46, -41.6),
  wall(-32, -24, -52.5, -48),
  wall(-14.5, -9.5, -60, -45),
  // Aerial platform behind the building.
  wall(20, 31, -45, -38),
  // Site cabin.
  wall(15, 22, 50.6, 53.6),
  // Tower crane base by the plot.
  wall(36.8, 39.2, -31.2, -28.8),
];

/** Walls of the ground floor once the frame stands (1 m blocks, door gap in the south wall). */
export const BUILDING_WALLS: Box[] = [
  wall(BUILDING.minX, DOOR.minX, -23, -22),
  wall(DOOR.maxX, BUILDING.maxX, -23, -22),
  wall(BUILDING.minX, BUILDING.maxX, -36, -35),
  wall(BUILDING.minX, BUILDING.minX + 1, BUILDING.minZ, BUILDING.maxZ),
  wall(BUILDING.maxX - 1, BUILDING.maxX, BUILDING.minZ, BUILDING.maxZ),
];

/** The open pit / foundation: the whole plot except the walkway to the stand. */
export const PLOT_BLOCKS: Box[] = [
  wall(BUILDING.minX, 22, BUILDING.minZ, BUILDING.maxZ),
  wall(26, BUILDING.maxX, BUILDING.minZ, BUILDING.maxZ),
  wall(22, 26, BUILDING.minZ, -30),
];

/** Obstacles for the current stage: walls once there is a frame, the pit before. */
export function obstaclesFor(hasWalls: boolean): Box[] {
  return [...STATIC_OBSTACLES, ...(hasWalls ? BUILDING_WALLS : PLOT_BLOCKS)];
}

export const OBSTACLES: Box[] = obstaclesFor(true);

export const PLAYER_RADIUS = 0.4;

/** Pushes a walker of `radius` at (x, z) out of the boxes and keeps it inside the bounds. */
export function resolveCollision(
  x: number,
  z: number,
  radius = PLAYER_RADIUS,
  boxes: Box[] = OBSTACLES,
  bounds: Box = BOUNDS,
): Vec2 {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const box of boxes) {
      const cx = Math.min(Math.max(x, box.minX), box.maxX);
      const cz = Math.min(Math.max(z, box.minZ), box.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      moved = true;
      if (d2 > 1e-9) {
        // Outside the box but closer than the radius: step back along the normal.
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // The centre is inside: leave through the nearest side.
        const exits = [
          { d: x - box.minX, x: box.minX - radius, z },
          { d: box.maxX - x, x: box.maxX + radius, z },
          { d: z - box.minZ, x, z: box.minZ - radius },
          { d: box.maxZ - z, x, z: box.maxZ + radius },
        ].sort((a, b) => a.d - b.d);
        x = exits[0]!.x;
        z = exits[0]!.z;
      }
    }
    if (!moved) break;
  }
  x = Math.min(Math.max(x, bounds.minX), bounds.maxX);
  z = Math.min(Math.max(z, bounds.minZ), bounds.maxZ);
  return [x, z];
}

/**
 * The tour route: a closed spline through these points. A point with `stop`
 * is where the camera halts at that zone's stand.
 */
export const TOUR_PATH: { p: Vec2; stop?: ZoneId }[] = [
  { p: [0, 58], stop: 'gate' },
  { p: [-5, 44] },
  { p: [-12, 30] },
  { p: [-15, 16], stop: 'kotlovan' },
  { p: [-13, 4] },
  { p: [-18, -1] },
  { p: [-24, -3], stop: 'doroga' },
  { p: [-17, -9] },
  { p: [-8, -22] },
  { p: [-14, -34], stop: 'sklad' },
  { p: [-2, -34] },
  { p: [12, -19] },
  { p: [23.4, -20] },
  { p: [24, -27.5], stop: 'korpus' },
  { p: [24.6, -20] },
  { p: [14, -6] },
  { p: [14, 15], stop: 'planirovka' },
  { p: [17, 33], stop: 'montazh' },
  { p: [12, 40] },
  { p: [10, 45], stop: 'office' },
  { p: [4, 54] },
];

/** Seconds the tour stays at a zone (longer while the visitor is talking). */
export const TOUR_STOP_SECONDS = 7;

/** Tour stops in route order. */
export function tourStops(): { index: number; zone: ZoneId }[] {
  return TOUR_PATH.flatMap((point, index) => (point.stop ? [{ index, zone: point.stop }] : []));
}
