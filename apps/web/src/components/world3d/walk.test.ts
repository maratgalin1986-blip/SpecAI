import { describe, expect, it } from 'vitest';
import { fromPerHour } from '@/lib/prices';
import { WORLD_KINDS } from './kinds';
import {
  blendPose,
  ease,
  flightProgress,
  isWalkHistory,
  nextIndex,
  prevIndex,
  stopFov,
  stopIndexOf,
  stopPose,
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

  it('puts an offset stop at its offset and looks at the machine', () => {
    const pose = stopPose(WALK_STOPS[0]!, anchor);
    expect(pose.pos).toEqual([18, 5.2, 20]);
    expect(pose.look).toEqual([7.5, 1.7, 6]);
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

  it('stands between a driving truck and the middle of the district', () => {
    const truck = WALK_STOPS[3]!;
    const pose = stopPose(truck, [28, 0, -10]);
    expect(pose.pos[0]).toBeCloseTo(28 * 0.55, 6);
    expect(pose.pos[2]).toBeCloseTo(-10 * 0.55, 6);
    expect(pose.pos[1]).toBe(5.5);
    // The pose follows the truck.
    expect(stopPose(truck, [20, 0, -20]).pos[0]).toBeCloseTo(11, 6);
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
    expect(stopFov(stop, 0.46)).toBe(stop.fov[1]);
    expect(stopFov(stop, 1.78)).toBe(stop.fov[0]);
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
