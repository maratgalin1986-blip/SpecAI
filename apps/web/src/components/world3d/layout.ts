// Where everything stands on the construction site of the 3D city. Pure numbers,
// no three.js: scene.ts places the machines from here, and layout.test.ts checks
// that no machine stands inside another one, inside the building or a person,
// and that every working machine actually reaches its job (the crane its slab
// stack and the frame, the excavator the truck it loads, the lift the facade).
//
// Axes: +x east, +z south, y up. A heading `yaw` is three.js `rotation.y`:
// a machine's local +x (its nose) points to (cos yaw, −sin yaw) in world x/z.

export interface Placed {
  x: number;
  z: number;
  yaw: number;
}

/** A footprint on the ground: a rectangle in the frame of something placed. */
export interface Footprint extends Placed {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A local point of something placed, in world x/z. */
export function toWorld(at: Placed, lx: number, lz: number): [number, number] {
  const c = Math.cos(at.yaw);
  const s = Math.sin(at.yaw);
  return [at.x + lx * c + lz * s, at.z - lx * s + lz * c];
}

function corners(f: Footprint): [number, number][] {
  return [
    toWorld(f, f.minX, f.minZ),
    toWorld(f, f.maxX, f.minZ),
    toWorld(f, f.maxX, f.maxZ),
    toWorld(f, f.minX, f.maxZ),
  ];
}

/** Whether two footprints overlap (separating axes of two rectangles). */
export function overlaps(a: Footprint, b: Footprint): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const f of [a, b]) {
    for (const [ax, az] of [
      [Math.cos(f.yaw), -Math.sin(f.yaw)],
      [Math.sin(f.yaw), Math.cos(f.yaw)],
    ] as const) {
      const pa = ca.map(([x, z]) => x * ax + z * az);
      const pb = cb.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Whether a world point lies inside a footprint grown by `margin`. */
export function contains(f: Footprint, x: number, z: number, margin = 0): boolean {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const dx = x - f.x;
  const dz = z - f.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    lx >= f.minX - margin && lx <= f.maxX + margin && lz >= f.minZ - margin && lz <= f.maxZ + margin
  );
}

// ---------------------------------------------------------------- the site

/** The fenced site: a rectangle around the origin. */
export const SITE = { hx: 20, hz: 15 };

/** The building going up: a concrete frame, `floors` slabs on columns. */
export const FRAME = { x: -6, z: -8, w: 14, d: 8, floors: 3, floorH: 2.9 };
/** Top of the highest slab. */
export const FRAME_TOP = FRAME.floors * FRAME.floorH + 0.15;

// ----- truck crane

export const CRANE = {
  elevation: 0.9,
  boomLength: 16,
  turretX: -2.0,
  turretY: 1.75,
  pivot: [-0.9, 1.3] as const,
};

/** Horizontal reach and height of the boom tip above the turret base. */
export function craneTip() {
  return {
    reach: CRANE.pivot[0] + CRANE.boomLength * Math.cos(CRANE.elevation),
    height: CRANE.turretY + CRANE.pivot[1] + CRANE.boomLength * Math.sin(CRANE.elevation),
  };
}

export const CRANE_AT: Placed = { x: 7.2, z: -4.4, yaw: 0 };
/** World headings of the boom over the slab stack and over the frame. */
export const CRANE_SLEW = { stack: 0.86, frame: 2.75 };

const craneTurret = toWorld(CRANE_AT, CRANE.turretX, 0);
function underHook(heading: number): [number, number] {
  const r = craneTip().reach;
  return [craneTurret[0] + r * Math.cos(heading), craneTurret[1] - r * Math.sin(heading)];
}
/** The stack of slabs lies where the hook comes down, turned along the boom. */
export const SLAB = { length: 6, width: 1.6 };
export const SLAB_STACK: Placed = {
  x: underHook(CRANE_SLEW.stack)[0],
  z: underHook(CRANE_SLEW.stack)[1],
  yaw: CRANE_SLEW.stack,
};
/** Where the slab is set down on the frame. */
export const SLAB_DROP: Placed = {
  x: underHook(CRANE_SLEW.frame)[0],
  z: underHook(CRANE_SLEW.frame)[1],
  yaw: CRANE_SLEW.frame,
};
/** The turret's own turn for a world heading of the boom. */
export function craneYaw(heading: number): number {
  return heading - CRANE_AT.yaw;
}

// ----- aerial platform at the south face of the frame

/** Horizontal distance from the lift's turret to the basket hinge, and the basket's depth. */
export const AGP_REACH = 5.05;
export const AGP_BASKET = 1.1;
export const AGP_TURRET_X = -1.5;
/** The gap between the basket and the facade. */
export const AGP_GAP = 0.45;
export const AGP_AT: Placed = {
  x: -7.5,
  z: FRAME.z + FRAME.d / 2 + AGP_GAP + AGP_BASKET + AGP_REACH,
  yaw: 0,
};
/** The lift's turret turn: the boom points north, at the facade. */
export const AGP_TURRET_YAW = Math.PI / 2;

// ----- excavator-loader and the truck it loads

export const BACKHOE_AT: Placed = { x: 9.4, z: 7.6, yaw: 0 };
/** The arm swings to this side to tip the bucket (negative: to the machine's left, north). */
export const BACKHOE_SWING = -1.35;
/** The loaded truck stands beside the arm's swing post, its body under the tipped bucket. */
export const LOAD_TRUCK_AT: Placed = {
  x: toWorld(BACKHOE_AT, -2.65, -4.05)[0],
  z: toWorld(BACKHOE_AT, -2.65, -4.05)[1],
  yaw: BACKHOE_AT.yaw,
};
/** Where the bucket tips: about 4.15 m from the swing post (local x −2.45) along the swung arm. */
export function bucketTip(): [number, number] {
  const r = 4.15;
  return toWorld(BACKHOE_AT, -2.45 - r * Math.cos(BACKHOE_SWING), r * Math.sin(BACKHOE_SWING));
}
/** The trench the arm digs: behind the machine. */
export const PIT: Placed = {
  x: toWorld(BACKHOE_AT, -7.1, 0)[0],
  z: toWorld(BACKHOE_AT, -7.1, 0)[1],
  yaw: BACKHOE_AT.yaw,
};

// ----- people and small things

export const CREW = {
  /** Walks along the south fence between two points. */
  walker: { from: -16, to: -3, z: 12.4 },
  foreman: { x: 15.6, z: -1.4 },
  rigger: { x: 16.9, z: -1.7 },
  /** On the first slab of the frame, at its south edge (frame coordinates). */
  welder: { x: 4.4, z: 3.5 },
};

/** The site office: a cabin with the platform's board on it. */
export const CABIN: Placed & { w: number; d: number } = { x: -15.2, z: 8.6, yaw: 0, w: 6, d: 2.5 };
/** Pallets of blocks waiting south of the frame. */
export const PALLETS: [number, number][] = [
  [-1.7, -1.9],
  [-0.1, -2.0],
];

export const TOWERS: [number, number][] = [
  [-19, 14],
  [19, -14],
];

// ---------------------------------------------------------------- footprints

/** A dump truck, mirrors and bumper included. */
export function truckFootprint(id: string, at: Placed, scale = 1): Footprint {
  return {
    id,
    ...at,
    minX: -3.2 * scale,
    maxX: 3.75 * scale,
    minZ: -1.6 * scale,
    maxZ: 1.6 * scale,
  };
}

/** Everything that stands on the site and must not run into anything else. */
export function siteFootprints(): Footprint[] {
  return [
    {
      id: 'frame',
      x: FRAME.x,
      z: FRAME.z,
      yaw: 0,
      minX: -FRAME.w / 2,
      maxX: FRAME.w / 2,
      minZ: -FRAME.d / 2,
      maxZ: FRAME.d / 2,
    },
    // Outrigger pads at ±3.85, the turret's counterweight swings inside them.
    { id: 'crane', ...CRANE_AT, minX: -5.45, maxX: 5.6, minZ: -3.9, maxZ: 3.9 },
    {
      id: 'slab-stack',
      ...SLAB_STACK,
      minX: -SLAB.length / 2,
      maxX: SLAB.length / 2,
      minZ: -SLAB.width / 2,
      maxZ: SLAB.width / 2,
    },
    // Outrigger pads at ±2.45; the boom works over the gap to the facade.
    { id: 'agp', ...AGP_AT, minX: -3.45, maxX: 3.8, minZ: -2.5, maxZ: 2.5 },
    // Stabiliser legs at the back, loader bucket at the front; the digging arm is not a footprint.
    { id: 'backhoe', ...BACKHOE_AT, minX: -2.8, maxX: 4.0, minZ: -1.75, maxZ: 1.75 },
    truckFootprint('load-truck', LOAD_TRUCK_AT),
    { id: 'pit', ...PIT, minX: -2.3, maxX: 2.3, minZ: -1.5, maxZ: 1.5 },
    {
      id: 'cabin',
      x: CABIN.x,
      z: CABIN.z,
      yaw: CABIN.yaw,
      minX: -CABIN.w / 2,
      maxX: CABIN.w / 2,
      minZ: -CABIN.d / 2,
      maxZ: CABIN.d / 2,
    },
    ...PALLETS.map(([x, z], i) => ({
      id: `pallet-${i}`,
      x,
      z,
      yaw: 0,
      minX: -0.65,
      maxX: 0.65,
      minZ: -0.55,
      maxZ: 0.55,
    })),
    ...TOWERS.map(([x, z], i) => ({
      id: `tower-${i}`,
      x,
      z,
      yaw: 0,
      minX: -0.3,
      maxX: 0.3,
      minZ: -0.3,
      maxZ: 0.3,
    })),
    person('foreman', CREW.foreman.x, CREW.foreman.z),
    person('rigger', CREW.rigger.x, CREW.rigger.z),
    {
      id: 'walker-path',
      x: (CREW.walker.from + CREW.walker.to) / 2,
      z: CREW.walker.z,
      yaw: 0,
      minX: (CREW.walker.from - CREW.walker.to) / 2 - 0.4,
      maxX: (CREW.walker.to - CREW.walker.from) / 2 + 0.4,
      minZ: -0.4,
      maxZ: 0.4,
    },
  ];
}

/**
 * How tall the things on the site are, metres (people and anything not listed: 2).
 * The camera of the walk flies over them, never through (layout.test.ts).
 */
export const SITE_HEIGHTS: Record<string, number> = {
  // The top slab, its railing and the platform's banner.
  frame: FRAME_TOP + 2.4,
  // The cab and the turret; the boom is a thin line above, the flight keeps off its foot.
  crane: 4.6,
  agp: 4.2,
  backhoe: 4.4,
  'load-truck': 3.6,
  cabin: 3.4,
  'slab-stack': 1.4,
  pit: 0.2,
};
/** The site fence. */
export const FENCE_HEIGHT = 2.2;

export function heightOf(id: string): number {
  return SITE_HEIGHTS[id] ?? 2;
}

function person(id: string, x: number, z: number): Footprint {
  return { id, x, z, yaw: 0, minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
}

/**
 * The ground the hanging slab sweeps between the stack and the frame: sampled
 * boxes along the arc (the slab hangs along the boom, 6 m long).
 */
export function slabSweep(steps = 12): Footprint[] {
  const out: Footprint[] = [];
  for (let i = 0; i <= steps; i++) {
    const heading = CRANE_SLEW.stack + ((CRANE_SLEW.frame - CRANE_SLEW.stack) * i) / steps;
    const [x, z] = underHook(heading);
    out.push({
      id: `slab-sweep-${i}`,
      x,
      z,
      yaw: heading,
      minX: -SLAB.length / 2,
      maxX: SLAB.length / 2,
      minZ: -SLAB.width / 2,
      maxZ: SLAB.width / 2,
    });
  }
  return out;
}

// ---------------------------------------------------------------- tags on the screen

/** A tag on the screen, CSS pixels from the top left corner. */
export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Which tags are shown: in order of importance, each one only if it covers none
 * of those already shown. `null` is a tag behind the camera.
 */
export function declutter(boxes: (ScreenBox | null)[]): boolean[] {
  const shown: ScreenBox[] = [];
  return boxes.map((box) => {
    if (!box) return false;
    const clash = shown.some(
      (s) => box.x < s.x + s.w && s.x < box.x + box.w && box.y < s.y + s.h && s.y < box.y + box.h,
    );
    if (!clash) shown.push(box);
    return !clash;
  });
}
