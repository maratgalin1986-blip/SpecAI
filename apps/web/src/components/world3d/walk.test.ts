import { describe, expect, it } from 'vitest';
import { fromPerHour } from '@/lib/prices';
import { WORLD_KINDS } from './kinds';
import {
  blendPose,
  ease,
  flightProgress,
  isWalkHistory,
  nextIndex,
  posterShape,
  prevIndex,
  stopFov,
  stopIndexOf,
  stopKey,
  stopLift,
  stopPose,
  stopPoster,
  STOP_POSTER_ALT,
  walkAutoplay,
  walkCard,
  walkReducer,
  walkRequested,
  walkStopPrice,
  withoutWalkParam,
  WALK_CLOSED,
  WALK_MAX_YAW,
  WALK_STOPS,
  type WalkState,
} from './walk';

describe('walk stops', () => {
  it('has exactly one stop per machinery kind, in the order of the chips', () => {
    expect(WALK_STOPS.map((s) => s.kind)).toEqual(WORLD_KINDS.map((k) => k.kind));
    expect(stopIndexOf('agp')).toBe(2);
  });

  it('wraps next and back around the tour', () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(3)).toBe(0);
    expect(prevIndex(0)).toBe(3);
    expect(prevIndex(2)).toBe(1);
  });
});

describe('walk state', () => {
  const open: WalkState = walkReducer(WALK_CLOSED, { type: 'open' });

  it('opens at the first stop and closes', () => {
    expect(open).toEqual({ open: true, index: 0, paused: false });
    expect(walkReducer(open, { type: 'close' }).open).toBe(false);
  });

  it('opens at a given stop, paused for reduced motion, and ignores a second open', () => {
    const s = walkReducer(WALK_CLOSED, { type: 'open', index: 2, paused: true });
    expect(s).toEqual({ open: true, index: 2, paused: true });
    expect(walkReducer(s, { type: 'open', index: 0 })).toBe(s);
  });

  it('moves between stops and toggles pause', () => {
    let s = walkReducer(open, { type: 'next' });
    expect(s.index).toBe(1);
    s = walkReducer(s, { type: 'prev' });
    s = walkReducer(s, { type: 'prev' });
    expect(s.index).toBe(3);
    s = walkReducer(s, { type: 'toggle-pause' });
    expect(s.paused).toBe(true);
    s = walkReducer(s, { type: 'goto', index: 99 });
    expect(s.index).toBe(3);
    s = walkReducer(s, { type: 'goto', index: -4 });
    expect(s.index).toBe(0);
    expect(walkReducer(s, { type: 'goto', index: Number.NaN }).index).toBe(0);
  });

  it('does nothing while the walk is closed', () => {
    expect(walkReducer(WALK_CLOSED, { type: 'next' })).toBe(WALK_CLOSED);
    expect(walkReducer(WALK_CLOSED, { type: 'toggle-pause' })).toBe(WALK_CLOSED);
    expect(walkReducer(WALK_CLOSED, { type: 'close' })).toBe(WALK_CLOSED);
  });
});

describe('camera path', () => {
  const anchor: [number, number, number] = [9, 0, 6];

  it('eases from 0 to 1', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-3)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    expect(ease(0.1)).toBeLessThan(0.1);
  });

  it('puts a site stop at its offset and looks at the machine', () => {
    const stop = WALK_STOPS[0]!;
    const pose = stopPose(stop, anchor);
    expect(pose.pos).toEqual([9 + stop.wide.cam[0], stop.wide.cam[1], 6 + stop.wide.cam[2]]);
    expect(pose.look).toEqual([9 + stop.wide.look[0], stop.wide.look[1], 6 + stop.wide.look[2]]);
    // A portrait phone gets its own shot.
    expect(stopPose(stop, anchor, 0, 0.46).pos[0]).toBeCloseTo(9 + stop.tall.cam[0], 6);
  });

  it('keeps the distance when the visitor drags to look around, within the limit', () => {
    const stop = WALK_STOPS[0]!;
    const a = stopPose(stop, anchor, 0);
    const b = stopPose(stop, anchor, 0.8);
    const dist = (p: [number, number, number]) => Math.hypot(p[0] - anchor[0], p[2] - anchor[2]);
    expect(dist(b.pos)).toBeCloseTo(dist(a.pos), 6);
    expect(b.pos[0]).not.toBeCloseTo(a.pos[0], 2);
    const huge = stopPose(stop, anchor, 50);
    const edge = stopPose(stop, anchor, WALK_MAX_YAW);
    expect(huge.pos).toEqual(edge.pos);
  });

  it('travels with a driving truck: the shot turns with its heading', () => {
    const truck = WALK_STOPS[3]!;
    expect(truck.mode).toBe('chase');
    const [cx, cy, cz] = truck.wide.cam;
    // Heading 0: the truck's nose points to +x, its right side to +z.
    const east = stopPose(truck, [28, 0, -10], 0, 1.6, 0);
    expect(east.pos[0]).toBeCloseTo(28 + cx, 6);
    expect(east.pos[1]).toBe(cy);
    expect(east.pos[2]).toBeCloseTo(-10 + cz, 6);
    // Heading π/2 (rotation.y): the nose points to −z, so «ahead» is north of the truck.
    const north = stopPose(truck, [28, 0, -10], 0, 1.6, Math.PI / 2);
    expect(north.pos[0]).toBeCloseTo(28 + cz, 6);
    expect(north.pos[2]).toBeCloseTo(-10 - cx, 6);
    // The pose follows the truck.
    expect(stopPose(truck, [20, 0, -20], 0, 1.6, 0).pos[0]).toBeCloseTo(20 + cx, 6);
  });

  it('hangs the key light over the machine of the stop and nowhere else', () => {
    for (const stop of WALK_STOPS) {
      const key = stopKey(stop, [5, 0, 7]);
      expect(key.pos[1]).toBeGreaterThan(6);
      expect(key.target).toEqual([5, 1.4, 7]);
      // A cone, not a flood: the other machines stand outside it.
      expect(key.angle).toBeGreaterThan(0.2);
      expect(key.angle).toBeLessThan(0.75);
      expect(stop.key.radius).toBeLessThan(10);
    }
  });

  it('lifts the picture above the card, more on a portrait phone', () => {
    expect(stopLift(0.46)).toBeGreaterThan(stopLift(1.6));
    expect(stopLift(1.6)).toBeGreaterThan(0);
    expect(stopLift(0.46)).toBeLessThan(0.2);
  });

  it('flies from one pose to the next: ends exactly, rises on the way', () => {
    const from = stopPose(WALK_STOPS[0]!, [9, 0, 6]);
    const to = stopPose(WALK_STOPS[1]!, [4, 0, -1]);
    expect(blendPose(from, to, 0).pos).toEqual(from.pos);
    expect(blendPose(from, to, 1).pos).toEqual(to.pos);
    expect(blendPose(from, to, 1).look).toEqual(to.look);
    const mid = blendPose(from, to, 0.5);
    expect(mid.pos[1]).toBeGreaterThan((from.pos[1] + to.pos[1]) / 2);
  });

  it('measures the progress of a flight', () => {
    expect(flightProgress(1000, 1000)).toBe(0);
    expect(flightProgress(1000, 2800, 3600)).toBeCloseTo(0.5, 6);
    expect(flightProgress(1000, 99999)).toBe(1);
    expect(flightProgress(1000, 0)).toBe(0);
    expect(flightProgress(0, 5, 0)).toBe(1);
  });

  it('uses a wider lens on a portrait phone', () => {
    const stop = WALK_STOPS[0]!;
    expect(stopFov(stop, 0.46)).toBe(stop.tall.fov);
    expect(stopFov(stop, 1.78)).toBe(stop.wide.fov);
    expect(stop.tall.fov).toBeGreaterThan(stop.wide.fov);
  });
});

describe('pictures of the stops (the walk without the live scene)', () => {
  it('gives every stop its own picture for a phone and for a wide screen', () => {
    const files = new Set<string>();
    for (const stop of WALK_STOPS)
      for (const shape of ['tall', 'wide'] as const) files.add(stopPoster(stop.kind, shape));
    expect(files.size).toBe(8);
    expect(stopPoster('agp', 'tall')).toBe('/images/world3d-stop-agp-tall.webp');
    expect(posterShape(390 / 844)).toBe('tall');
    expect(posterShape(1440 / 900)).toBe('wide');
  });

  it('describes each picture by its own machine', () => {
    expect(STOP_POSTER_ALT.excavator).toMatch(/Экскаватор/);
    expect(STOP_POSTER_ALT.crane).toMatch(/Автокран/);
    expect(STOP_POSTER_ALT.agp).toMatch(/Автовышка/);
    expect(STOP_POSTER_ALT.dump).toMatch(/Самосвал/);
  });
});

describe('walk card', () => {
  it('takes every price from lib/prices.ts, never a number of its own', () => {
    expect(walkStopPrice('excavator')).toBe(fromPerHour('backhoe'));
    expect(walkStopPrice('crane')).toBe(fromPerHour('crane'));
    expect(walkStopPrice('agp')).toBe(fromPerHour('agp'));
    expect(walkStopPrice('dump')).toBe(fromPerHour('truck'));
    expect(walkStopPrice('dump')).toMatch(/₽\/ч с\s?машинистом$/);
  });

  it('links the order form with the kind of the stop', () => {
    const ids = { excavator: 'ck1', crane: 'ck2', agp: 'ck3', dump: 'ck4' };
    expect(walkCard(1, ids).orderHref).toBe('/orders?category=ck2#new');
    expect(walkCard(3, ids).orderHref).toBe('/orders?category=ck4#new');
    // Unknown category: the plain form, never a broken link.
    expect(walkCard(0, {}).orderHref).toBe('/orders#new');
    expect(walkCard(2, ids).counter).toBe('Остановка 3 из 4');
    expect(walkCard(2, ids).title).toBe('Автовышка');
  });

  it('never says «наряд»', () => {
    for (let i = 0; i < WALK_STOPS.length; i++) {
      const card = walkCard(i, {});
      expect(`${card.title} ${card.text} ${card.price} ${card.counter}`).not.toMatch(/наряд/i);
    }
  });
});

describe('walk entry', () => {
  it('opens from ?walk=1 only', () => {
    expect(walkRequested('?walk=1')).toBe(true);
    expect(walkRequested('?intro=0&walk=1')).toBe(true);
    expect(walkRequested('?walk=0')).toBe(false);
    expect(walkRequested('')).toBe(false);
  });

  it('removes the flag and keeps the rest of the address', () => {
    expect(withoutWalkParam('/', '?walk=1')).toBe('/');
    expect(withoutWalkParam('/', '?intro=0&walk=1', '#x')).toBe('/?intro=0#x');
  });

  it('recognises its own history entry', () => {
    expect(isWalkHistory({ w3dWalk: true })).toBe(true);
    expect(isWalkHistory({ __NA: true })).toBe(false);
    expect(isWalkHistory(null)).toBe(false);
  });

  it('does not move on its own with reduced motion', () => {
    expect(walkAutoplay(true)).toBe(false);
    expect(walkAutoplay(false)).toBe(true);
  });
});
