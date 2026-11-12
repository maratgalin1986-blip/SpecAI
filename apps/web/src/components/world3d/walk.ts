// «Прогуляться по городу» (owner, 2026-11-10): the guided walk through the 3D
// city of the home page. Pure logic only, no three.js and no DOM, so the first
// chunk of the home page stays light and the rules are unit-tested: the stops
// (one per machinery kind), the camera path between them, the walk state, the
// timing, the price line of a stop and the links of its card.
import { fromPerHour } from '@/lib/prices';
import type { MachineType } from '@/lib/machinePhotos';
import { kindInfo, worldOrderHref, WORLD_KINDS, type WorldKind } from './kinds';

export type Vec3 = [number, number, number];

/** One shot: where the camera stands and looks (offsets from the machine), and its lens. */
export interface StopShot {
  cam: Vec3;
  look: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

export interface WalkStop {
  kind: WorldKind;
  /**
   * 'site': offsets are in world axes (the machine works on one spot).
   * 'chase': offsets are in the machine's own frame, x ahead and z to its right,
   * so the camera travels with a truck driving round the ring road.
   */
  mode: 'site' | 'chase';
  /** The shot for a landscape screen and for a portrait phone. */
  wide: StopShot;
  tall: StopShot;
  /** The key light of the stop: where it hangs (offset from the machine) and how wide it falls. */
  key: { from: Vec3; radius: number };
}

/**
 * One stop per machinery kind, in the order of the chips under the picture.
 * Every shot is its own: the camera stands near the height of the machine, on a
 * different side each time, close enough that the machine fills the frame.
 */
export const WALK_STOPS: WalkStop[] = [
  {
    // From the south-east corner of the site: the loader bucket in front, the
    // arm swinging over the truck behind it.
    kind: 'excavator',
    mode: 'site',
    wide: { cam: [8.3, 2.0, 6.4], look: [-1.3, 1.7, -0.9], fov: 40 },
    tall: { cam: [9.6, 2.2, 3.6], look: [0.9, 1.8, -0.3], fov: 62 },
    key: { from: [7, 10, 7], radius: 7.5 },
  },
  {
    // From the north-east, low, by the slab stack: the cab towards the camera,
    // the boom carrying a slab across the sky to the frame.
    kind: 'crane',
    mode: 'site',
    wide: { cam: [10.3, 1.8, -6.6], look: [-1.5, 4.6, 0.3], fov: 50 },
    tall: { cam: [11.2, 1.9, -6.2], look: [0.3, 5.0, -0.3], fov: 68 },
    key: { from: [9, 13, -8], radius: 9 },
  },
  {
    // From the south-east: the cab towards the camera, the boom side-on, its
    // basket rising along the facade under the platform's banner.
    kind: 'agp',
    mode: 'site',
    wide: { cam: [6.0, 2.2, 8.4], look: [-1.2, 3.0, -2.0], fov: 44 },
    tall: { cam: [6.5, 2.0, 8.6], look: [-1.0, 3.2, -2.0], fov: 72 },
    key: { from: [-6, 11, 7], radius: 8 },
  },
  {
    // From the kerb ahead of the truck, travelling with it: the city slides past behind.
    kind: 'dump',
    mode: 'chase',
    wide: { cam: [7.4, 1.7, -4.9], look: [0.3, 1.3, 0], fov: 40 },
    tall: { cam: [10.6, 2.0, -4.9], look: [0, 1.7, 0], fov: 54 },
    key: { from: [6, 9, -6], radius: 6.5 },
  },
];

/** How long the camera rests at a stop before the tour moves on, ms. */
export const WALK_DWELL_MS = 9000;
/** How long the flight from one stop to the next lasts, ms. */
export const WALK_FLIGHT_MS = 3600;
/** The drag-to-look turn is limited to this many radians either way. */
export const WALK_MAX_YAW = 1.35;
/** Below this width / height the screen gets the portrait shot. */
export const WALK_TALL_ASPECT = 1.2;
export function stopIndexOf(kind: WorldKind): number {
  const index = WALK_STOPS.findIndex((stop) => stop.kind === kind);
  return index < 0 ? 0 : index;
}

/** The next stop; after the last one the tour starts again. */
export function nextIndex(index: number, count = WALK_STOPS.length): number {
  return count <= 0 ? 0 : (((index + 1) % count) + count) % count;
}

/** The previous stop; before the first one it jumps to the last. */
export function prevIndex(index: number, count = WALK_STOPS.length): number {
  return count <= 0 ? 0 : (((index - 1) % count) + count) % count;
}

// ---------------------------------------------------------------- state

export interface WalkState {
  open: boolean;
  index: number;
  /** The tour waits at the current stop (the visitor pressed pause, or reduced motion). */
  paused: boolean;
}

export type WalkAction =
  | { type: 'open'; index?: number; paused?: boolean }
  | { type: 'close' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'toggle-pause' };

export const WALK_CLOSED: WalkState = { open: false, index: 0, paused: false };

export function walkReducer(state: WalkState, action: WalkAction): WalkState {
  switch (action.type) {
    case 'open':
      return state.open
        ? state
        : { open: true, index: clampIndex(action.index ?? 0), paused: action.paused ?? false };
    case 'close':
      return state.open ? { ...state, open: false } : state;
    case 'next':
      return state.open ? { ...state, index: nextIndex(state.index) } : state;
    case 'prev':
      return state.open ? { ...state, index: prevIndex(state.index) } : state;
    case 'goto':
      return state.open ? { ...state, index: clampIndex(action.index) } : state;
    case 'toggle-pause':
      return state.open ? { ...state, paused: !state.paused } : state;
  }
}

function clampIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(WALK_STOPS.length - 1, Math.max(0, Math.trunc(index)));
}

// ---------------------------------------------------------------- camera path

export interface CameraPose {
  pos: Vec3;
  look: Vec3;
}

/** Smoother-step easing 0 → 1: the camera starts and stops softly. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** The shot of a stop for the screen shape. */
export function stopShot(stop: WalkStop, aspect: number): StopShot {
  return aspect < WALK_TALL_ASPECT ? stop.tall : stop.wide;
}

/** The picture of a stop for the same two screen shapes (the walk without the live scene). */
export function posterShape(aspect: number): 'tall' | 'wide' {
  return aspect < WALK_TALL_ASPECT ? 'tall' : 'wide';
}

/**
 * How far the picture is lifted, as a share of the screen height: the card of
 * the stop covers the bottom of the screen, the machine sits above it.
 */
export function stopLift(aspect: number): number {
  return aspect < WALK_TALL_ASPECT ? 0.13 : 0.08;
}

/** An offset in the frame of the stop (world axes, or the machine's own) as a world offset. */
function inFrame(stop: WalkStop, offset: Vec3, heading: number): Vec3 {
  if (stop.mode !== 'chase') return offset;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [offset[0] * c + offset[2] * s, offset[1], -offset[0] * s + offset[2] * c];
}

/**
 * Where the camera stands at a stop. `anchor` is the machine's current position
 * and `heading` its turn (a driving truck moves, so the pose follows it); `yaw`
 * is the visitor's drag-to-look turn around the machine.
 */
export function stopPose(
  stop: WalkStop,
  anchor: Vec3,
  yaw = 0,
  aspect = 16 / 9,
  heading = 0,
): CameraPose {
  const shot = stopShot(stop, aspect);
  const [ax, ay, az] = anchor;
  const [ox, oy, oz] = inFrame(stop, shot.cam, heading);
  const [lx, ly, lz] = inFrame(stop, shot.look, heading);
  const limit = Math.min(WALK_MAX_YAW, Math.max(-WALK_MAX_YAW, yaw));
  const cos = Math.cos(limit);
  const sin = Math.sin(limit);
  return {
    pos: [ax + ox * cos + oz * sin, ay + oy, az - ox * sin + oz * cos],
    look: [ax + lx, ay + ly, az + lz],
  };
}

/** Where the key light of a stop hangs and what it points at. */
export function stopKey(
  stop: WalkStop,
  anchor: Vec3,
  heading = 0,
): { pos: Vec3; target: Vec3; angle: number } {
  const [fx, fy, fz] = inFrame(stop, stop.key.from, heading);
  return {
    pos: [anchor[0] + fx, anchor[1] + fy, anchor[2] + fz],
    target: [anchor[0], anchor[1] + 1.4, anchor[2]],
    angle: Math.atan2(stop.key.radius, Math.hypot(fx, fy, fz)),
  };
}

/**
 * The flight between two poses at progress t (0..1): eased, with the camera
 * rising on the way so it passes over the machines and the frame instead of
 * cutting through them.
 */
export function blendPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = ease(t);
  const dx = to.pos[0] - from.pos[0];
  const dz = to.pos[2] - from.pos[2];
  const far = Math.hypot(dx, dz);
  // A flat-topped arc: up early, across at height, down late, so that the low
  // start and end of the flight stay near the stops and everything between is cleared.
  const lift = k >= 1 ? 0 : Math.min(19, 4 + far * 0.45) * Math.sqrt(Math.sin(Math.PI * k));
  const mix = (a: number, b: number) => (k >= 1 ? b : a + (b - a) * k);
  return {
    pos: [
      mix(from.pos[0], to.pos[0]),
      mix(from.pos[1], to.pos[1]) + lift,
      mix(from.pos[2], to.pos[2]),
    ],
    look: [
      mix(from.look[0], to.look[0]),
      mix(from.look[1], to.look[1]),
      mix(from.look[2], to.look[2]),
    ],
  };
}

/** The progress of a flight that started at `startMs`, 0..1. */
export function flightProgress(startMs: number, nowMs: number, flightMs = WALK_FLIGHT_MS): number {
  if (flightMs <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - startMs) / flightMs));
}

/** The field of view for the screen shape (wider lens on a portrait phone). */
export function stopFov(stop: WalkStop, aspect: number): number {
  return stopShot(stop, aspect).fov;
}

// ---------------------------------------------------------------- card

/** The catalogue machine type whose price a stop shows (lib/prices.ts). */
export const WALK_PRICE_TYPE: Record<WorldKind, MachineType> = {
  excavator: 'backhoe',
  crane: 'crane',
  agp: 'agp',
  dump: 'truck',
};

/** «от 4 000 ₽/ч с машинистом» for the stop, always from lib/prices.ts. */
export function walkStopPrice(kind: WorldKind): string {
  return fromPerHour(WALK_PRICE_TYPE[kind]);
}

export interface WalkCard {
  kind: WorldKind;
  title: string;
  text: string;
  price: string;
  orderHref: string;
  /** «Остановка 2 из 4». */
  counter: string;
}

/** What the card of a stop says and where its buttons lead. */
export function walkCard(
  index: number,
  categoryIds: Partial<Record<WorldKind, string>>,
  count = WALK_STOPS.length,
): WalkCard {
  const stop = WALK_STOPS[clampIndex(index)] ?? WALK_STOPS[0]!;
  const info = kindInfo(stop.kind);
  return {
    kind: stop.kind,
    title: info.title,
    text: info.text,
    price: walkStopPrice(stop.kind),
    orderHref: worldOrderHref(categoryIds[stop.kind]),
    counter: `Остановка ${clampIndex(index) + 1} из ${count}`,
  };
}

// ---------------------------------------------------------------- entry

/** The walk opens straight from `/?walk=1`. */
export function walkRequested(search: string): boolean {
  return new URLSearchParams(search).get('walk') === '1';
}

/** The same address without the walk flag (a reload does not reopen the walk). */
export function withoutWalkParam(pathname: string, search: string, hash = ''): string {
  const params = new URLSearchParams(search);
  params.delete('walk');
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}

/** The history marker of an open walk: Back pops it and closes the walk. */
export const WALK_HISTORY_KEY = 'w3dWalk';

export function isWalkHistory(state: unknown): boolean {
  return typeof state === 'object' && state !== null && WALK_HISTORY_KEY in state;
}

/** Whether the tour starts moving on its own (not for reduced motion). */
export function walkAutoplay(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

/**
 * Without the live scene (no WebGL, data saver, weak phone, or the frame-rate
 * guard gave up mid-walk) every stop shows its own picture, rendered from the
 * same scene with the camera of that stop: a portrait one for phones and a
 * landscape one. No labels are baked in. Re-rendered by scripts/world3d-pictures.cjs.
 */
export function stopPoster(kind: WorldKind, shape: 'tall' | 'wide'): string {
  return `/images/world3d-stop-${kind}-${shape}.webp`;
}

/** What the picture of a stop shows, for its alt text. */
export const STOP_POSTER_ALT: Record<WorldKind, string> = {
  excavator: 'Экскаватор-погрузчик копает траншею и грузит грунт в самосвал',
  crane: 'Автокран поднимает плиту перекрытия на каркас здания',
  agp: 'Автовышка поднимает рабочего в люльке к фасаду',
  dump: 'Самосвал едет по вечерней улице',
};

export const WALK_STOP_COUNT = WORLD_KINDS.length;
