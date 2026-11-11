// «Прогуляться по городу» (owner, 2026-11-10): the guided walk through the 3D
// city of the home page. Pure logic only, no three.js and no DOM, so the first
// chunk of the home page stays light and the rules are unit-tested: the stops
// (one per machinery kind), the camera path between them, the walk state, the
// timing, the price line of a stop and the links of its card.
import { fromPerHour } from '@/lib/prices';
import type { MachineType } from '@/lib/machinePhotos';
import { kindInfo, worldOrderHref, WORLD_KINDS, type WorldKind } from './kinds';

export type Vec3 = [number, number, number];

export interface WalkStop {
  kind: WorldKind;
  /**
   * 'offset': the camera hangs at a fixed offset from the machine.
   * 'inward': the camera stands between the machine and the middle of the
   * district at height `lift` (for a truck driving round the ring road).
   */
  mode: 'offset' | 'inward';
  /** Camera offset from the machine ('offset') or `[factor, lift, 0]` ('inward'). */
  cam: Vec3;
  /** Where the camera looks, as an offset from the machine. */
  look: Vec3;
  /** Field of view for a landscape and a portrait screen. */
  fov: [number, number];
}

/** One stop per machinery kind, in the order of the chips under the picture. */
export const WALK_STOPS: WalkStop[] = [
  { kind: 'excavator', mode: 'offset', cam: [9, 5.2, 14], look: [-1.5, 1.7, 0], fov: [38, 52] },
  { kind: 'crane', mode: 'offset', cam: [-17, 10, 21], look: [0, 4.6, -1], fov: [40, 54] },
  { kind: 'agp', mode: 'offset', cam: [-6, 6.5, 17], look: [0, 3.4, 0], fov: [40, 54] },
  { kind: 'dump', mode: 'inward', cam: [0.55, 5.5, 0], look: [0, 1.2, 0], fov: [38, 52] },
];

/** How long the camera rests at a stop before the tour moves on, ms. */
export const WALK_DWELL_MS = 9000;
/** How long the flight from one stop to the next lasts, ms. */
export const WALK_FLIGHT_MS = 3600;
/** The drag-to-look turn is limited to this many radians either way. */
export const WALK_MAX_YAW = 1.35;

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

/**
 * Where the camera stands at a stop. `anchor` is the machine's current position
 * (a driving truck moves, so the pose follows it); `yaw` is the visitor's
 * drag-to-look turn around the machine.
 */
export interface StopView {
  /** Pulls the camera back (a portrait phone needs more room). */
  zoom: number;
  /** Lowers the look-at point, so the machine sits higher on the screen (above the card). */
  drop: number;
}

/** The view for the screen shape: portrait phones stand further back and lift the subject. */
export function stopView(aspect: number): StopView {
  return aspect < 1.2 ? { zoom: 1.45, drop: 2.4 } : { zoom: 1, drop: 0 };
}

export function stopPose(
  stop: WalkStop,
  anchor: Vec3,
  yaw = 0,
  view: StopView = { zoom: 1, drop: 0 },
): CameraPose {
  const [ax, ay, az] = anchor;
  let ox: number;
  let oy: number;
  let oz: number;
  if (stop.mode === 'inward') {
    // Between the machine and the middle of the district.
    ox = (ax * stop.cam[0] - ax) * view.zoom;
    oy = stop.cam[1] * view.zoom;
    oz = (az * stop.cam[0] - az) * view.zoom;
  } else {
    [ox, oy, oz] = [stop.cam[0] * view.zoom, stop.cam[1] * view.zoom, stop.cam[2] * view.zoom];
  }
  const limit = Math.min(WALK_MAX_YAW, Math.max(-WALK_MAX_YAW, yaw));
  const cos = Math.cos(limit);
  const sin = Math.sin(limit);
  return {
    pos: [ax + ox * cos + oz * sin, ay + oy, az - ox * sin + oz * cos],
    look: [ax + stop.look[0], ay + stop.look[1] - view.drop, az + stop.look[2]],
  };
}

/**
 * The flight between two poses at progress t (0..1): eased, with the camera
 * rising on the way so it passes over fences and the site instead of cutting
 * through them.
 */
export function blendPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = ease(t);
  const dx = to.pos[0] - from.pos[0];
  const dz = to.pos[2] - from.pos[2];
  const lift = Math.min(10, Math.hypot(dx, dz) * 0.18) * Math.sin(Math.PI * k);
  const mix = (a: number, b: number) => a + (b - a) * k;
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
  return aspect < 1.2 ? stop.fov[1] : stop.fov[0];
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
 * Without the live scene (no WebGL, data saver, weak phone) the walk pans and
 * zooms the poster instead: where each machine is on the picture, in percent
 * of its width and height, and how far to zoom in.
 */
export const POSTER_FOCUS: Record<WorldKind, { x: number; y: number; scale: number }> = {
  excavator: { x: 53, y: 63, scale: 1.9 },
  crane: { x: 56, y: 47, scale: 1.9 },
  agp: { x: 43, y: 42, scale: 1.9 },
  dump: { x: 21, y: 69, scale: 1.9 },
};

export const WALK_STOP_COUNT = WORLD_KINDS.length;
