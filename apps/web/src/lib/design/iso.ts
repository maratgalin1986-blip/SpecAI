import type { Vec3 } from '@/lib/smeta3d';
import type { Building, Landscape } from '@/lib/design/types';

// Wireframe 3D of a design: line segments in world metres (x along the
// length, y across, z up, centred on the footprint) for the projection
// helpers of lib/smeta3d. No faces, no textures — an engineering sketch.

export type IsoKind = 'wall' | 'floor' | 'roof' | 'open' | 'ground' | 'tree' | 'zone';

export interface IsoLine {
  a: Vec3;
  b: Vec3;
  kind: IsoKind;
}

export interface IsoModel {
  lines: IsoLine[];
  /** Bounding box for fitView. */
  L: number;
  W: number;
  height: number;
}

const ROOF_SLOPE = Math.tan((32 * Math.PI) / 180);

function rect(
  lines: IsoLine[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  kind: IsoKind,
) {
  lines.push(
    { a: [x0, y0, z], b: [x1, y0, z], kind },
    { a: [x1, y0, z], b: [x1, y1, z], kind },
    { a: [x1, y1, z], b: [x0, y1, z], kind },
    { a: [x0, y1, z], b: [x0, y0, z], kind },
  );
}

function box(
  lines: IsoLine[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  kind: IsoKind,
) {
  rect(lines, x0, y0, x1, y1, z0, kind);
  rect(lines, x0, y0, x1, y1, z1, kind);
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const) {
    lines.push({ a: [x, y, z0], b: [x, y, z1], kind });
  }
}

/** Roof over a box x0..x1 × y0..y1 at height z. Returns the ridge height. */
function roof(
  lines: IsoLine[],
  type: Building['roof'],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
): number {
  const L = x1 - x0;
  const W = y1 - y0;
  const o = 0.4;
  if (type === 'flat') {
    box(lines, x0, y0, x1, y1, z, z + 0.5, 'roof');
    return z + 0.5;
  }
  // Ridge along the longer side.
  const alongX = L >= W;
  const half = (alongX ? W : L) / 2;
  const rise = half * ROOF_SLOPE;
  const ez = z - o * ROOF_SLOPE;
  const top = z + rise;
  const ex0 = x0 - o;
  const ex1 = x1 + o;
  const ey0 = y0 - o;
  const ey1 = y1 + o;
  rect(lines, ex0, ey0, ex1, ey1, ez, 'roof');
  if (alongX) {
    const cy = (y0 + y1) / 2;
    const r0 = type === 'hip' ? x0 + half : ex0;
    const r1 = type === 'hip' ? x1 - half : ex1;
    lines.push({
      a: [Math.min(r0, (x0 + x1) / 2), cy, top],
      b: [Math.max(r1, (x0 + x1) / 2), cy, top],
      kind: 'roof',
    });
    for (const [ex, rx] of [
      [ex0, Math.min(r0, (x0 + x1) / 2)],
      [ex1, Math.max(r1, (x0 + x1) / 2)],
    ] as const) {
      lines.push(
        { a: [ex, ey0, ez], b: [rx, cy, top], kind: 'roof' },
        { a: [ex, ey1, ez], b: [rx, cy, top], kind: 'roof' },
      );
      if (type === 'gable') {
        const gx = ex === ex0 ? x0 : x1;
        lines.push(
          { a: [gx, y0, z], b: [gx, cy, top - o * ROOF_SLOPE * 0], kind: 'wall' },
          { a: [gx, y1, z], b: [gx, cy, top], kind: 'wall' },
        );
      }
    }
  } else {
    const cx = (x0 + x1) / 2;
    const r0 = type === 'hip' ? y0 + half : ey0;
    const r1 = type === 'hip' ? y1 - half : ey1;
    lines.push({
      a: [cx, Math.min(r0, (y0 + y1) / 2), top],
      b: [cx, Math.max(r1, (y0 + y1) / 2), top],
      kind: 'roof',
    });
    for (const [ey, ry] of [
      [ey0, Math.min(r0, (y0 + y1) / 2)],
      [ey1, Math.max(r1, (y0 + y1) / 2)],
    ] as const) {
      lines.push(
        { a: [ex0, ey, ez], b: [cx, ry, top], kind: 'roof' },
        { a: [ex1, ey, ez], b: [cx, ry, top], kind: 'roof' },
      );
      if (type === 'gable') {
        const gy = ey === ey0 ? y0 : y1;
        lines.push(
          { a: [x0, gy, z], b: [cx, gy, top], kind: 'wall' },
          { a: [x1, gy, z], b: [cx, gy, top], kind: 'wall' },
        );
      }
    }
  }
  return top;
}

export const STOREY_SLAB = 0.3;

export function buildingIso(b: Building): IsoModel {
  const lines: IsoLine[] = [];
  const { L, W } = b;
  const ox = -L / 2;
  const oy = -W / 2;
  const storey = b.ceiling + STOREY_SLAB;
  const H = storey * b.floors.length;
  rect(lines, ox - 1.5, oy - 1.5, ox + L + 1.5, oy + W + 1.5, 0, 'ground');
  if (b.roof === 'barrel') {
    // A barrel lying on the ground: end circles, hoops and generatrices.
    const R = W / 2;
    const ring = (x: number, kind: IsoKind) => {
      const n = 24;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2;
        const t1 = ((i + 1) / n) * Math.PI * 2;
        lines.push({
          a: [x, oy + R + R * Math.cos(t0), R + R * Math.sin(t0)],
          b: [x, oy + R + R * Math.cos(t1), R + R * Math.sin(t1)],
          kind,
        });
      }
    };
    ring(ox, 'wall');
    ring(ox + L, 'wall');
    ring(ox + L * 0.25, 'floor');
    ring(ox + L * 0.75, 'floor');
    for (const t of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI]) {
      const y = oy + R + R * Math.cos(t);
      const z = R + R * Math.sin(t);
      lines.push({ a: [ox, y, z], b: [ox + L, y, z], kind: 'roof' });
    }
    // Door in the front end.
    const dw = 0.35;
    rect(lines, ox, oy + R - dw, ox, oy + R + dw, 0, 'open');
    lines.push(
      { a: [ox, oy + R - dw, 0.1], b: [ox, oy + R - dw, 1.75], kind: 'open' },
      { a: [ox, oy + R + dw, 0.1], b: [ox, oy + R + dw, 1.75], kind: 'open' },
      { a: [ox, oy + R - dw, 1.75], b: [ox, oy + R + dw, 1.75], kind: 'open' },
    );
    return { lines, L, W, height: W };
  }
  box(lines, ox, oy, ox + L, oy + W, 0, H, 'wall');
  b.floors.forEach((f, k) => {
    const z0 = k * storey;
    if (k > 0) rect(lines, ox, oy, ox + L, oy + W, z0, 'floor');
    for (const s of f.partitions) {
      lines.push({
        a: [ox + s.x1, oy + s.y1, z0 + 0.02],
        b: [ox + s.x2, oy + s.y2, z0 + 0.02],
        kind: 'floor',
      });
    }
    const face = (axis: 'x' | 'y', at: number) =>
      axis === 'x' ? (at < W / 2 ? 0 : W) : at < L / 2 ? 0 : L;
    const opening = (
      axis: 'x' | 'y',
      at: number,
      pos: number,
      w: number,
      zb: number,
      zt: number,
    ) => {
      const f0 = face(axis, at);
      const p0 = pos - w / 2;
      const p1 = pos + w / 2;
      const P = (p: number, z: number): Vec3 =>
        axis === 'x' ? [ox + p, oy + f0, z] : [ox + f0, oy + p, z];
      lines.push(
        { a: P(p0, zb), b: P(p1, zb), kind: 'open' },
        { a: P(p1, zb), b: P(p1, zt), kind: 'open' },
        { a: P(p1, zt), b: P(p0, zt), kind: 'open' },
        { a: P(p0, zt), b: P(p0, zb), kind: 'open' },
      );
    };
    for (const w of f.windows) {
      const sill = w.height >= 1.8 ? 0.6 : w.height <= 0.6 ? 1.5 : 0.85;
      opening(
        w.axis,
        w.axis === 'x' ? w.y : w.x,
        w.axis === 'x' ? w.x : w.y,
        w.width,
        z0 + sill,
        z0 + sill + w.height,
      );
    }
    for (const d of f.doors) {
      if (d.rooms[1] !== null) continue;
      opening(
        d.axis,
        d.axis === 'x' ? d.y : d.x,
        d.axis === 'x' ? d.x : d.y,
        d.width,
        z0,
        z0 + (d.kind === 'gate' ? 2.3 : 2.1),
      );
    }
  });
  const top = roof(lines, b.roof, ox, oy, ox + L, oy + W, H);
  return { lines, L, W, height: top };
}

export function landscapeIso(l: Landscape): IsoModel {
  const lines: IsoLine[] = [];
  // Plan y grows towards the street; world y the same, centred.
  const ox = -l.W / 2;
  const oy = -l.L / 2;
  // Swap axes so the long side runs along world x: world x = plan y.
  const P = (x: number, y: number, z: number): Vec3 => [oy + y, ox + x, z];
  const R = (x0: number, y0: number, x1: number, y1: number, z: number, kind: IsoKind) => {
    lines.push(
      { a: P(x0, y0, z), b: P(x1, y0, z), kind },
      { a: P(x1, y0, z), b: P(x1, y1, z), kind },
      { a: P(x1, y1, z), b: P(x0, y1, z), kind },
      { a: P(x0, y1, z), b: P(x0, y0, z), kind },
    );
  };
  R(0, 0, l.W, l.L, 0, 'ground');
  // Fence: top rail and posts every ~3 m.
  R(0, 0, l.W, l.L, 1.5, 'ground');
  for (const [x0, y0, x1, y1] of [
    [0, 0, l.W, 0],
    [l.W, 0, l.W, l.L],
    [l.W, l.L, 0, l.L],
    [0, l.L, 0, 0],
  ] as const) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      lines.push({ a: P(x, y, 0), b: P(x, y, 1.5), kind: 'ground' });
    }
  }
  let height = 1.5;
  for (const z of l.zones) {
    const { x, y, w, h } = z.rect;
    if (z.kind === 'house') {
      const H = 6;
      const boxLines: IsoLine[] = [];
      box(boxLines, y, x, y + h, x + w, 0, H, 'wall');
      const top = roof(boxLines, 'gable', y, x, y + h, x + w, H);
      height = Math.max(height, top);
      for (const ln of boxLines) {
        lines.push({
          a: [oy + ln.a[0], ox + ln.a[1], ln.a[2]],
          b: [oy + ln.b[0], ox + ln.b[1], ln.b[2]],
          kind: ln.kind,
        });
      }
    } else if (z.kind === 'terrace') {
      R(x, y, x + w, y + h, 0.4, 'floor');
      for (const [px, py] of [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ] as const) {
        lines.push({ a: P(px, py, 0), b: P(px, py, 0.4), kind: 'floor' });
      }
    } else if (z.kind === 'playground') {
      R(x, y, x + w, y + h, 0, 'zone');
      // A swing frame.
      const cx = x + w / 2;
      lines.push(
        { a: P(cx - 1.2, y + h / 2 - 0.8, 0), b: P(cx - 1.2, y + h / 2, 2.2), kind: 'tree' },
        { a: P(cx - 1.2, y + h / 2 + 0.8, 0), b: P(cx - 1.2, y + h / 2, 2.2), kind: 'tree' },
        { a: P(cx + 1.2, y + h / 2 - 0.8, 0), b: P(cx + 1.2, y + h / 2, 2.2), kind: 'tree' },
        { a: P(cx + 1.2, y + h / 2 + 0.8, 0), b: P(cx + 1.2, y + h / 2, 2.2), kind: 'tree' },
        { a: P(cx - 1.2, y + h / 2, 2.2), b: P(cx + 1.2, y + h / 2, 2.2), kind: 'tree' },
      );
    } else {
      R(x, y, x + w, y + h, 0, 'zone');
    }
  }
  for (const b of l.beds) R(b.x, b.y, b.x + b.w, b.y + b.h, 0.25, 'zone');
  for (const t of l.trees) {
    lines.push(
      { a: P(t.x, t.y, 0), b: P(t.x, t.y, 1.4), kind: 'tree' },
      { a: P(t.x - 1, t.y, 2.4), b: P(t.x, t.y, 3.6), kind: 'tree' },
      { a: P(t.x, t.y, 3.6), b: P(t.x + 1, t.y, 2.4), kind: 'tree' },
      { a: P(t.x + 1, t.y, 2.4), b: P(t.x, t.y, 1.4), kind: 'tree' },
      { a: P(t.x, t.y, 1.4), b: P(t.x - 1, t.y, 2.4), kind: 'tree' },
      { a: P(t.x, t.y - 1, 2.4), b: P(t.x, t.y, 3.6), kind: 'tree' },
      { a: P(t.x, t.y + 1, 2.4), b: P(t.x, t.y, 3.6), kind: 'tree' },
    );
  }
  return { lines, L: l.L, W: l.W, height };
}
