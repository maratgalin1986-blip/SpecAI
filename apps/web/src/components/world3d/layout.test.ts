import { describe, expect, it } from 'vitest';
import {
  AGP_AT,
  AGP_BASKET,
  AGP_GAP,
  AGP_REACH,
  AGP_TURRET_X,
  BACKHOE_AT,
  bucketTip,
  contains,
  CRANE_AT,
  CREW,
  declutter,
  FENCE_HEIGHT,
  FRAME,
  heightOf,
  LOAD_TRUCK_AT,
  overlaps,
  SITE,
  siteFootprints,
  SLAB_DROP,
  slabSweep,
  toWorld,
  truckFootprint,
  type Footprint,
} from './layout';
import { blendPose, stopPose, WALK_STOPS, type Vec3 } from './walk';

const all = siteFootprints();
const byId = (id: string): Footprint => {
  const f = all.find((x) => x.id === id);
  if (!f) throw new Error(`no footprint ${id}`);
  return f;
};
const corners = (f: Footprint) =>
  [
    [f.minX, f.minZ],
    [f.maxX, f.minZ],
    [f.maxX, f.maxZ],
    [f.minX, f.maxZ],
  ].map(([x, z]) => toWorld(f, x!, z!));

describe('site layout', () => {
  it('finds overlapping and separate boxes', () => {
    const a = truckFootprint('a', { x: 0, z: 0, yaw: 0 });
    expect(overlaps(a, truckFootprint('b', { x: 2, z: 1, yaw: 0.7 }))).toBe(true);
    expect(overlaps(a, truckFootprint('c', { x: 0, z: 3.3, yaw: 0 }))).toBe(false);
    // Turned across: the long side of one reaches the other.
    expect(overlaps(a, truckFootprint('d', { x: 0, z: 4.5, yaw: Math.PI / 2 }))).toBe(true);
    expect(contains(a, 3.7, 0)).toBe(true);
    expect(contains(a, 3.9, 0)).toBe(false);
    expect(contains(a, 3.9, 0, 0.3)).toBe(true);
  });

  it('no machine, building, stack, cabin or person stands inside another', () => {
    const clashes: string[] = [];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        if (overlaps(all[i]!, all[j]!)) clashes.push(`${all[i]!.id} × ${all[j]!.id}`);
    expect(clashes).toEqual([]);
  });

  it('keeps the machines the walk stops at well apart', () => {
    const machines = ['crane', 'agp', 'backhoe', 'load-truck'].map(byId);
    const grown = machines.map((m) => ({
      ...m,
      minX: m.minX - 0.3,
      maxX: m.maxX + 0.3,
      minZ: m.minZ - 0.3,
      maxZ: m.maxZ + 0.3,
    }));
    for (let i = 0; i < grown.length; i++)
      for (let j = i + 1; j < grown.length; j++)
        expect(overlaps(grown[i]!, grown[j]!), `${grown[i]!.id} × ${grown[j]!.id}`).toBe(false);
  });

  it('keeps everything inside the fence', () => {
    for (const f of all)
      for (const [x, z] of corners(f)) {
        expect(Math.abs(x), f.id).toBeLessThan(SITE.hx);
        expect(Math.abs(z), f.id).toBeLessThan(SITE.hz);
      }
  });

  it('carries the slab over nothing but the crane, its stack and the frame', () => {
    const under = new Set<string>();
    for (const step of slabSweep(24)) for (const f of all) if (overlaps(step, f)) under.add(f.id);
    for (const id of under) expect(['crane', 'slab-stack', 'frame']).toContain(id);
    // Nobody stands under the load.
    for (const who of [CREW.foreman, CREW.rigger])
      for (const step of slabSweep(24)) expect(contains(step, who.x, who.z, 0.6)).toBe(false);
  });

  it('lets every machine reach its job', () => {
    // The crane sets the slab down on the frame, whole.
    const frame = byId('frame');
    const drop: Footprint = { id: 'drop', ...SLAB_DROP, minX: -3, maxX: 3, minZ: -0.8, maxZ: 0.8 };
    for (const [x, z] of corners(drop)) expect(contains(frame, x, z)).toBe(true);
    // The excavator tips its bucket into the body of the truck (behind the cab).
    const [bx, bz] = bucketTip();
    const body: Footprint = {
      id: 'body',
      ...LOAD_TRUCK_AT,
      minX: -2.8,
      maxX: 1.4,
      minZ: -1.1,
      maxZ: 1.1,
    };
    expect(contains(body, bx, bz)).toBe(true);
    // The lift's basket hangs just off the south face of the frame.
    const [tx, tz] = toWorld(AGP_AT, AGP_TURRET_X, 0);
    const basketFar = tz - AGP_REACH - AGP_BASKET;
    expect(basketFar - (FRAME.z + FRAME.d / 2)).toBeCloseTo(AGP_GAP, 6);
    expect(Math.abs(tx - FRAME.x)).toBeLessThan(FRAME.w / 2);
    // The welder stands on the slab.
    expect(Math.abs(CREW.welder.x)).toBeLessThan(FRAME.w / 2);
    expect(Math.abs(CREW.welder.z)).toBeLessThan(FRAME.d / 2);
  });
});

describe('walk shots on the site', () => {
  const anchorOf: Record<string, Vec3> = {
    excavator: [BACKHOE_AT.x, 0, BACKHOE_AT.z],
    crane: [CRANE_AT.x, 0, CRANE_AT.z],
    agp: [AGP_AT.x, 0, AGP_AT.z],
  };
  const siteStops = WALK_STOPS.filter((s) => s.mode === 'site');

  it('puts the camera inside the fence and inside nothing', () => {
    for (const stop of siteStops)
      for (const aspect of [0.46, 1.6]) {
        const { pos } = stopPose(stop, anchorOf[stop.kind]!, 0, aspect);
        expect(Math.abs(pos[0]), stop.kind).toBeLessThan(SITE.hx - 0.3);
        expect(Math.abs(pos[2]), stop.kind).toBeLessThan(SITE.hz - 0.3);
        for (const f of all)
          expect(contains(f, pos[0], pos[2], 0.5), `${stop.kind} camera in ${f.id}`).toBe(false);
      }
  });

  it('stands near the height of the machine and looks at it from close by', () => {
    for (const stop of WALK_STOPS)
      for (const shot of [stop.wide, stop.tall]) {
        expect(shot.cam[1], stop.kind).toBeLessThanOrEqual(2.6);
        expect(shot.cam[1], stop.kind).toBeGreaterThanOrEqual(1.4);
        expect(Math.hypot(shot.cam[0], shot.cam[2]), stop.kind).toBeLessThan(14);
        // The machine is what the camera looks at: the target is within its length.
        expect(Math.hypot(shot.look[0], shot.look[2]), stop.kind).toBeLessThan(3.2);
      }
  });

  it('makes every stop its own shot: another place, another direction', () => {
    for (const aspect of [0.46, 1.6]) {
      const poses = siteStops.map((s) => stopPose(s, anchorOf[s.kind]!, 0, aspect));
      for (let i = 0; i < poses.length; i++)
        for (let j = i + 1; j < poses.length; j++) {
          const a = poses[i]!;
          const b = poses[j]!;
          expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2])).toBeGreaterThan(8);
          const dir = (p: typeof a) => Math.atan2(p.look[2] - p.pos[2], p.look[0] - p.pos[0]);
          const turn = Math.abs(Math.atan2(Math.sin(dir(a) - dir(b)), Math.cos(dir(a) - dir(b))));
          expect(turn, `${siteStops[i]!.kind} / ${siteStops[j]!.kind}`).toBeGreaterThan(0.3);
        }
    }
  });

  it('flies between the stops over the machines, the frame and the fence, never through', () => {
    // The truck of the last stop drives the ring road: a few places it can be at.
    const ring: [Vec3, number][] = [
      [[26, 0, 4], Math.PI / 2],
      [[-26, 0, -6], -Math.PI / 2],
      [[5, 0, 21], 0],
      [[-8, 0, -21], Math.PI],
    ];
    const hits: string[] = [];
    for (const aspect of [0.46, 1.6]) {
      const site = siteStops.map((s) => stopPose(s, anchorOf[s.kind]!, 0, aspect));
      const chase = ring.map(([at, heading]) => stopPose(WALK_STOPS[3]!, at, 0, aspect, heading));
      // The block view the walk starts from and returns to.
      const orbit = { pos: [30, 16, 38] as Vec3, look: [0, 2.5, 0] as Vec3 };
      const poses = [...site, ...chase, orbit];
      for (let i = 0; i < poses.length; i++)
        for (let j = 0; j < poses.length; j++) {
          if (i === j) continue;
          for (let t = 0.02; t < 1; t += 0.02) {
            const { pos } = blendPose(poses[i]!, poses[j]!, t);
            for (const f of all)
              if (contains(f, pos[0], pos[2], 0.6) && pos[1] < heightOf(f.id) + 0.6)
                hits.push(
                  `${i}→${j} ${aspect} t=${t.toFixed(2)} in ${f.id} at y=${pos[1].toFixed(1)}`,
                );
            const fenceX = Math.abs(Math.abs(pos[0]) - SITE.hx) < 0.5 && Math.abs(pos[2]) < SITE.hz;
            const fenceZ = Math.abs(Math.abs(pos[2]) - SITE.hz) < 0.5 && Math.abs(pos[0]) < SITE.hx;
            if ((fenceX || fenceZ) && pos[1] < FENCE_HEIGHT + 0.5)
              hits.push(
                `${i}→${j} ${aspect} t=${t.toFixed(2)} in the fence at y=${pos[1].toFixed(1)}`,
              );
          }
        }
    }
    expect(hits).toEqual([]);
  });
});

describe('tags over the machines', () => {
  it('hides a tag that would cover a more important one', () => {
    const a = { x: 100, y: 100, w: 150, h: 40 };
    expect(
      declutter([a, { x: 200, y: 120, w: 150, h: 40 }, { x: 260, y: 100, w: 150, h: 40 }]),
    ).toEqual([true, false, true]);
    // A tag behind the camera is not shown and hides nothing.
    expect(declutter([null, a])).toEqual([false, true]);
  });
});
