// «Куда идём?»: what the visitor can choose in the 3D site — places (the
// zones), people (the named characters and the crew) and sights. Pure data,
// shared by the chooser (Stroyka.tsx) and the camera (engine.ts).
import { BOUNDS, ZONES, type SpeakerId, type Vec3, type ZoneId } from '@/lib/stroyka';
import { CREW } from '@/lib/stroyka/crew';

/** Where the camera goes: stand at x, z (plus `lift` metres up) and look at `look`. */
export interface TravelTarget {
  x: number;
  z: number;
  look: Vec3;
  /** Extra eye height on arrival (the view from the top). */
  lift?: number;
  /** 'fly': a cinematic arc over the site; 'walk': along the ground, around obstacles. */
  how?: 'fly' | 'walk';
}

export const ZONE_ICONS: Record<ZoneId, string> = {
  gate: '🚧',
  kotlovan: '⛏️',
  planirovka: '🚜',
  doroga: '🛣️',
  sklad: '📦',
  korpus: '🏢',
  montazh: '🔩',
  office: '🏠',
  smeta: '🧮',
};

export interface NavPlace {
  id: ZoneId;
  name: string;
  icon: string;
}

export const NAV_PLACES: NavPlace[] = ZONES.map((z) => ({
  id: z.id,
  name: z.name,
  icon: ZONE_ICONS[z.id],
}));

export interface NavPerson {
  /** The character id in the engine (`npc-<zone>` or a crew id). */
  id: string;
  name: string;
  role: string;
  speaker: SpeakerId | 'worker';
  zone?: ZoneId;
}

/** Where each named character meets the visitor first (their main zone). */
const HOME_ZONE: Record<SpeakerId, ZoneId> = {
  mihalych: 'gate',
  rinat: 'kotlovan',
  ildar: 'montazh',
  sveta: 'office',
  alsu: 'smeta',
};

const NAMED: { speaker: SpeakerId; name: string; role: string }[] = [
  { speaker: 'mihalych', name: 'Михалыч', role: 'прораб' },
  { speaker: 'rinat', name: 'Ринат', role: 'машинист экскаватора' },
  { speaker: 'ildar', name: 'Ильдар', role: 'крановщик' },
  { speaker: 'sveta', name: 'Света', role: 'логист, оформит заявку' },
  { speaker: 'alsu', name: 'Алсу', role: 'снабженец, материалы' },
];

/** Crew on duty in the daytime (the guard only walks at night). */
const CREW_IDS = ['worker-pit', 'worker-sling', 'worker-yard', 'worker-road', 'worker-walk'];
const CREW_ROLES: Record<string, string> = {
  'worker-pit': 'котлован',
  'worker-sling': 'стропальщик',
  'worker-yard': 'склад',
  'worker-road': 'дорога',
  'worker-walk': 'разнорабочий',
};

export const NAV_PEOPLE: NavPerson[] = [
  ...NAMED.map((p) => ({
    id: `npc-${HOME_ZONE[p.speaker]}`,
    name: p.name,
    role: p.role,
    speaker: p.speaker,
    zone: HOME_ZONE[p.speaker],
  })),
  ...CREW_IDS.filter((id) => CREW[id]).map((id) => ({
    id,
    name: CREW[id]!.name,
    role: CREW_ROLES[id] ?? 'бригада',
    speaker: 'worker' as const,
  })),
];

export interface NavSight {
  id: string;
  name: string;
  icon: string;
  target: TravelTarget;
}

/** Sights: where to stand and what to look at (positions from engine.ts / world.ts). */
export const NAV_SIGHTS: NavSight[] = [
  // The truck crane at (36, 22) lifting slabs onto the frame.
  {
    id: 'crane',
    name: 'Кран в работе',
    icon: '🏗️',
    target: { x: 22, z: 36, look: [37, 6, 22], lift: 1.5 },
  },
  // The backhoe at (-23, 22) loading the dump truck.
  {
    id: 'excavator',
    name: 'Экскаватор копает',
    icon: '⛏️',
    target: { x: -13, z: 25, look: [-24, 1.5, 23], lift: 1 },
  },
  // The LED screen at (-38, 53), facing east.
  {
    id: 'led',
    name: 'Экран с роликами',
    icon: '📺',
    target: { x: -25, z: 55, look: [-38, 5, 53] },
  },
  // The flags at the gate (Russia, Tatarstan, СпецПласт16), seen from the street.
  {
    id: 'flags',
    name: 'Флаги у ворот',
    icon: '🚩',
    target: { x: 0, z: 73, look: [0, 6, 64], lift: 0.4 },
  },
  // The whole site from above, over the south-east corner.
  {
    id: 'top',
    name: 'Вид сверху',
    icon: '🦅',
    target: { x: 34, z: 58, look: [0, 0, 2], lift: 32 },
  },
];

/** Keeps a point inside the walkable bounds (a tap on the ground far away). */
export function clampToBounds(x: number, z: number): [number, number] {
  return [
    Math.min(Math.max(x, BOUNDS.minX), BOUNDS.maxX),
    Math.min(Math.max(z, BOUNDS.minZ), BOUNDS.maxZ),
  ];
}

/** Eased progress for camera moves: slow start, slow landing. */
export function easeInOut(k: number) {
  const t = Math.min(1, Math.max(0, k));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** The shortest signed turn from angle a to angle b (radians). */
export function turnBetween(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
