// The machine types of the home-page 3D city (owner, 2026-10-28: «Верни 3D-мир»)
// and the rules that decide whether a device gets the live scene or the poster.
// No three.js here: the home page imports this file in its first chunk.

export type WorldKind = 'excavator' | 'crane' | 'agp' | 'dump';

export interface WorldKindInfo {
  kind: WorldKind;
  /** Short name on the chip and the card. */
  title: string;
  /** One line about the job. */
  text: string;
  /** Catalog slug (packages/shared/src/categories.ts) for the order form. */
  slug: string;
}

export const WORLD_KINDS: WorldKindInfo[] = [
  {
    kind: 'excavator',
    title: 'Экскаватор-погрузчик',
    text: 'Котлован, траншея, погрузка грунта в самосвал.',
    slug: 'backhoe-loaders',
  },
  {
    kind: 'crane',
    title: 'Автокран',
    text: 'Подъём плит и конструкций, монтаж каркаса.',
    slug: 'cranes',
  },
  {
    kind: 'agp',
    title: 'Автовышка',
    text: 'Работы на высоте: фасад, окна, кровля, реклама.',
    slug: 'aerial-platforms',
  },
  {
    kind: 'dump',
    title: 'Самосвал',
    text: 'Вывоз грунта и мусора, подвоз песка и щебня.',
    slug: 'dump-trucks',
  },
];

export function kindInfo(kind: WorldKind): WorldKindInfo {
  return WORLD_KINDS.find((item) => item.kind === kind) ?? WORLD_KINDS[0]!;
}

const ID = /^[\w-]{1,64}$/;

/** The order form with the machine type filled in, or the plain form when the id is unknown. */
export function worldOrderHref(categoryId: string | undefined): string {
  return categoryId && ID.test(categoryId)
    ? `/orders?category=${encodeURIComponent(categoryId)}#new`
    : '/orders#new';
}

/** Where a provider signs up to go «на линию». */
export const WORLD_PROVIDER_HREF = '/register?role=provider';

export interface DeviceHints {
  webgl: boolean;
  reducedMotion: boolean;
  saveData?: boolean;
  /** navigator.deviceMemory in GB (Chrome only; Safari leaves it out). */
  memory?: number;
  cores?: number;
}

/**
 * 'live' — run the animated scene; 'still' — one rendered frame, no motion
 * (prefers-reduced-motion); 'poster' — no WebGL at all (no WebGL, data saver,
 * or a weak phone).
 */
export function worldMode(hints: DeviceHints): 'live' | 'still' | 'poster' {
  if (!hints.webgl || hints.saveData) return 'poster';
  if (hints.memory !== undefined && hints.memory < 3) return 'poster';
  if (hints.cores !== undefined && hints.cores < 4) return 'poster';
  return hints.reducedMotion ? 'still' : 'live';
}

/** Device pixel ratio used by the renderer: never above 1.5 (1.25 on phones). */
export function worldPixelRatio(devicePixelRatio: number, phone: boolean): number {
  const cap = phone ? 1.25 : 1.5;
  return Math.max(1, Math.min(cap, devicePixelRatio || 1));
}

/**
 * Average frame time (ms) after which the scene gives up and shows the
 * poster: under ~20 fps for two seconds is not «smooth».
 */
export const SLOW_FRAME_MS = 50;
