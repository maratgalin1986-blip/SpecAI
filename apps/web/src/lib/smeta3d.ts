import type { MachineType } from '@/lib/machinePhotos';
import type { Smeta, SmetaInput, SmetaRow } from '@/lib/smeta';
import { visibleSceneCount, type Project } from '@/lib/smetaProject';

// The blueprint film on /smeta: a tiny isometric projection and the list of
// scenes it plays. Pure math and data; the canvas lives in Smeta3D.tsx.

export type Vec3 = readonly [number, number, number];

export interface View {
  /** Rotation around the vertical axis, radians. */
  yaw: number;
  /** Camera elevation, radians (0 — side view, π/2 — plan). */
  pitch: number;
  scale: number;
  cx: number;
  cy: number;
}

export const DEFAULT_PITCH = 0.6;

/** World (x along the length, y along the width, z up, metres) → screen px. */
export function project(p: Vec3, v: View): [number, number] {
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  const x = p[0] * c - p[1] * s;
  const y = p[0] * s + p[1] * c;
  return [v.cx + x * v.scale, v.cy + (y * Math.sin(v.pitch) - p[2] * Math.cos(v.pitch)) * v.scale];
}

/** A view that fits a box of L×W from `depth` below ground to `height` above. */
export function fitView(
  size: { L: number; W: number; depth: number; height: number; margin: number },
  w: number,
  h: number,
  yaw: number,
  pitch = DEFAULT_PITCH,
): View {
  const radius = Math.hypot(size.L / 2 + size.margin, size.W / 2 + size.margin);
  const vertical = 2 * radius * Math.sin(pitch) + (size.height + size.depth) * Math.cos(pitch);
  const scale = Math.max(
    0.01,
    Math.min((w * 0.86) / (2 * radius), (h * 0.8) / Math.max(vertical, 0.1)),
  );
  const cy = h / 2 + ((size.height - size.depth) / 2) * Math.cos(pitch) * scale;
  return { yaw, pitch, scale, cx: w / 2, cy };
}

/** Seconds per stage so the whole film takes about 24 s. */
export const stageSeconds = (n: number) => Math.min(3.5, Math.max(2, 24 / Math.max(1, n)));

export type SceneKind =
  | 'plot'
  | 'prep'
  | 'dig'
  | 'haul'
  | 'foundation'
  | 'base'
  | 'backfill'
  | 'walls'
  | 'roof'
  | 'facade'
  | 'landscape'
  | 'pile'
  | 'demolish'
  | 'lift'
  | 'kmu'
  | 'height'
  | 'compact'
  | 'snow';

export interface SceneStage {
  kind: SceneKind;
  title: string;
  machines: string;
  hours: number;
  days: number | null;
  cost: number;
  cumulative: number;
  metric: string;
  order: MachineType | null;
}

export interface Scene {
  L: number;
  W: number;
  depth: number;
  height: number;
  floors: number;
  /** ring — trenches along the walls; box — a pit or a layer; piles. */
  shape: 'ring' | 'box' | 'piles';
  roof: 'gable' | 'flat';
  trips: number;
  volume: number;
  /** Extra numbers some scenes draw: lifts, weight, thickness… */
  extra: number;
  stages: SceneStage[];
  /** Stages shown before the lock (all when unlocked). */
  lockAt: number;
}

const sumRows = (rows: SmetaRow[]) => rows.reduce((s, r) => s + r.sum, 0);
const names = (rows: SmetaRow[]) => [...new Set(rows.map((r) => r.name))].join(', ');

export function projectScene(project: Project, unlocked: boolean): Scene {
  const { input, geo } = project;
  const plot: SceneStage = {
    kind: 'plot',
    title: 'Ваш участок',
    machines: '—',
    hours: 0,
    days: null,
    cost: 0,
    cumulative: 0,
    metric: `${input.length}×${input.width} м`,
    order: null,
  };
  const stages = [
    plot,
    ...project.stages.map((s) => ({
      kind: s.id as SceneKind,
      title: s.title,
      machines: names(s.rows),
      hours: s.hours,
      days: s.days,
      cost: s.cost,
      cumulative: s.cumulative,
      metric: s.metric,
      order: s.rows[0]?.machine ?? null,
    })),
  ];
  const shape =
    input.object === 'site' || input.foundation === 'slab'
      ? 'box'
      : input.foundation === 'piles'
        ? 'piles'
        : 'ring';
  return {
    L: input.length,
    W: input.width,
    depth: geo.depth,
    height: geo.height,
    floors: input.object === 'warehouse' ? 1 : input.floors,
    shape,
    roof: input.object === 'warehouse' ? 'flat' : 'gable',
    trips: geo.trips,
    volume: geo.digVolume,
    extra: geo.concrete,
    stages,
    lockAt: unlocked ? stages.length : 1 + visibleSceneCount(project),
  };
}

/** Scenes for the single-operation jobs, from their own geometry. */
export function jobScene(smeta: Smeta, input: SmetaInput): Scene {
  const job = smeta.job;
  const v = (id: keyof SmetaInput & string) => {
    const f = job.fields.find((x) => x.id === id);
    const raw = (input as Record<string, number | undefined>)[id] ?? f?.initial ?? 0;
    return f ? Math.min(f.max, Math.max(f.min, raw)) : raw;
  };
  const opt = (id: 'haul' | 'backfill' | 'roller') =>
    input.options?.[id] ?? job.options.find((o) => o.id === id)?.initial ?? false;
  const by = (...m: MachineType[]) => smeta.rows.filter((r) => m.includes(r.machine));
  const truck = by('truck');
  const tripsOf = (row?: SmetaRow) => Number(row?.task.match(/(\d+) рейс/)?.[1] ?? 0);
  let L = 10;
  let W = 8;
  let depth = 0;
  let height = 0;
  let volume = 0;
  let extra = 0;
  const kinds: [SceneKind, SmetaRow[], string][] = [];
  const side = (area: number) => Math.sqrt(area);
  switch (job.id) {
    case 'trench':
    case 'pit': {
      L = v('length');
      W = v('width');
      depth = v('depth');
      volume = L * W * depth;
      kinds.push(
        ['plot', [], `${L}×${W} м`],
        ['dig', by('backhoe', 'excavator'), `${Math.round(volume * 10) / 10} м³`],
      );
      if (opt('haul')) kinds.push(['haul', truck, `${tripsOf(truck[0])} рейс(ов)`]);
      if (job.id === 'trench' && opt('backfill')) kinds.push(['backfill', [], 'обратная засыпка']);
      break;
    }
    case 'planning':
    case 'compaction': {
      L = W = Math.round(side(v('area')) * 10) / 10;
      kinds.push(['plot', [], `${v('area')} м²`]);
      if (job.id === 'planning') kinds.push(['prep', by('backhoe', 'dozer'), `${v('area')} м²`]);
      if (job.id === 'compaction' || opt('roller')) kinds.push(['compact', by('roller'), 'укатка']);
      break;
    }
    case 'haul':
      volume = v('volume');
      L = W = Math.max(6, Math.cbrt(volume) * 2.5);
      kinds.push(
        ['pile', by('backhoe', 'loader'), `${volume} м³`],
        ['haul', truck, `${tripsOf(truck[0])} рейс(ов)`],
      );
      break;
    case 'demolition':
      L = W = Math.max(3, side(v('area')));
      extra = v('thickness') / 100;
      kinds.push(['demolish', by('wheeled-excavator'), `${v('area')} м² × ${v('thickness')} см`]);
      if (opt('haul')) kinds.push(['haul', truck, `${tripsOf(truck[0])} рейс(ов)`]);
      break;
    case 'lift':
      height = 9;
      extra = v('weight');
      kinds.push(['lift', smeta.rows, `${v('lifts')} подъёмов до ${v('weight')} т`]);
      break;
    case 'kmu':
      L = 14;
      W = 8;
      height = 3;
      kinds.push(['kmu', smeta.rows, `${v('trips')} рейс(ов) по ${v('distance')} км`]);
      break;
    case 'height':
      L = 10;
      W = 6;
      height = 12;
      kinds.push(['height', smeta.rows, `${v('hours')} ч на высоте`]);
      break;
    case 'snow':
      L = W = side(v('area'));
      extra = v('depth');
      kinds.push(['snow', by('loader'), `${v('area')} м² × ${v('depth')} м`]);
      if (opt('haul')) kinds.push(['haul', truck, `${tripsOf(truck[0])} рейс(ов)`]);
      break;
  }
  let cumulative = 0;
  const stages = kinds.map(([kind, rows, metric]) => {
    const cost = sumRows(rows);
    cumulative += cost;
    return {
      kind,
      title: kind === 'plot' ? 'Ваш участок' : job.title,
      machines: rows.length ? names(rows) : '—',
      hours: rows.reduce((h, r) => h + r.hours, 0),
      days: null,
      cost,
      cumulative,
      metric,
      order: rows[0]?.machine ?? null,
    };
  });
  for (const s of stages) if (s.kind === 'haul') s.title = 'Вывоз самосвалами';
  return {
    L,
    W,
    depth,
    height,
    floors: 0,
    shape: 'box',
    roof: 'flat',
    trips: tripsOf(truck[0]),
    volume,
    extra,
    stages,
    lockAt: stages.length,
  };
}

// ── The drawing: SVG path strings per stage, in screen pixels ────────────

export interface Leader {
  /** Anchor on the object and the text position, px. */
  ax: number;
  ay: number;
  x: number;
  y: number;
  text: string;
  right: boolean;
}

export interface DimText {
  x: number;
  y: number;
  angle: number;
  text: string;
}

export interface StageDrawing {
  /** Object lines (drawn with the dash-draw effect when the stage plays). */
  d: string;
  /** Chain lines: plot boundaries. */
  chain: string;
  /** Section hatching on cut faces, pass lines. */
  hatch: string;
  /** Dimension and extension lines with arrows. */
  dims: string;
  dimTexts: DimText[];
  leaders: Leader[];
}

export interface Drawing {
  w: number;
  h: number;
  /** «1:200» — approximate, the drawing is a scheme. */
  scale: string;
  stages: StageDrawing[];
}

const NICE_SCALES = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** Drawing scale at 96 dpi: 1 px = 0.2646 mm. */
export function scaleLabel(pxPerMetre: number): string {
  const raw = 1000 / (pxPerMetre * 0.2646);
  const nice = NICE_SCALES.find((s) => s >= raw) ?? NICE_SCALES[NICE_SCALES.length - 1]!;
  return `1:${nice}`;
}

const n1 = (x: number) => Math.round(x * 10) / 10;
const fm = (n: number) => n1(n).toLocaleString('ru-RU');

export function sceneDrawing(scene: Scene, yaw: number, w: number, h: number): Drawing {
  const { L, W, depth: D } = scene;
  const hx = L / 2;
  const hy = W / 2;
  const built = scene.floors > 0;
  const roofRise = scene.roof === 'gable' ? Math.min(W, L) * 0.3 : 0.6;
  const top = scene.height + (built ? 0.3 : 0);
  const ground = Math.max(L, W);
  const v = fitView(
    {
      L,
      W,
      depth: Math.max(D, 1),
      height: top + (built ? roofRise : 2),
      margin: ground * 0.15 + 3,
    },
    w,
    h - 40,
    yaw,
  );
  const P = (p: Vec3) => project(p, v);
  // +y' on screen is towards the viewer.
  const towards = (nx: number, ny: number) => nx * Math.sin(yaw) + ny * Math.cos(yaw);

  let cur: Record<'d' | 'chain' | 'hatch' | 'dims', string> = {
    d: '',
    chain: '',
    hatch: '',
    dims: '',
  };
  let dimTexts: DimText[] = [];
  let leaders: Leader[] = [];
  type Target = keyof typeof cur;
  const line = (pts: Vec3[], close = false, target: Target = 'd') => {
    cur[target] +=
      pts
        .map((p, i) => {
          const [x, y] = P(p);
          return `${i ? 'L' : 'M'}${n1(x)} ${n1(y)}`;
        })
        .join('') + (close ? 'Z' : '');
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, z: number): Vec3[] => [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const a = rect(x0, y0, x1, y1, z0);
    const b = rect(x0, y0, x1, y1, z1);
    line(a, true);
    line(b, true);
    for (let i = 0; i < 4; i++) line([a[i]!, b[i]!]);
  };
  /** 45° section hatching on the inner walls of a cut that face the viewer. */
  const cutHatch = (x0: number, y0: number, x1: number, y1: number, z0: number) => {
    const faces: [Vec3, Vec3, number, number][] = [
      [[x0, y0, 0], [x1, y0, 0], 0, 1],
      [[x1, y1, 0], [x0, y1, 0], 0, -1],
      [[x0, y1, 0], [x0, y0, 0], 1, 0],
      [[x1, y0, 0], [x1, y1, 0], -1, 0],
    ];
    const depth = -z0;
    const step = Math.max(0.4, ground / 28);
    for (const [a, b, nx, ny] of faces) {
      if (towards(nx, ny) <= 0.05) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const at = (s: number, z: number): Vec3 => [
        a[0] + ((b[0] - a[0]) * s) / len,
        a[1] + ((b[1] - a[1]) * s) / len,
        z,
      ];
      // Lines from the bottom edge up at 45°, clipped to the face.
      for (let s = -depth; s < len; s += step) {
        const s0 = Math.max(0, s);
        const s1 = Math.min(len, s + depth);
        if (s1 <= s0) continue;
        line([at(s0, z0 + (s0 - s)), at(s1, z0 + (s1 - s))], false, 'hatch');
      }
    }
  };
  /** Dimension line between a and b, pushed out by `off`, with arrows. */
  const dim = (a: Vec3, b: Vec3, off: Vec3, text: string) => {
    const a2: Vec3 = [a[0] + off[0], a[1] + off[1], a[2] + off[2]];
    const b2: Vec3 = [b[0] + off[0], b[1] + off[1], b[2] + off[2]];
    line([a, a2], false, 'dims');
    line([b, b2], false, 'dims');
    const [x1, y1] = P(a2);
    const [x2, y2] = P(b2);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const arrow = (x: number, y: number, s: number) =>
      `M${n1(x + s * (6 * ux - 2.5 * uy))} ${n1(y + s * (6 * uy + 2.5 * ux))}L${n1(x)} ${n1(y)}L${n1(x + s * (6 * ux + 2.5 * uy))} ${n1(y + s * (6 * uy - 2.5 * ux))}`;
    cur.dims += `M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}${arrow(x1, y1, 1)}${arrow(x2, y2, -1)}`;
    let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const r = (angle * Math.PI) / 180;
    dimTexts.push({
      x: n1((x1 + x2) / 2 + 6 * Math.sin(r)),
      y: n1((y1 + y2) / 2 - 6 * Math.cos(r)),
      angle: n1(angle),
      text,
    });
  };
  const leader = (p: Vec3, text: string, up = 1) => {
    const [ax, ay] = P(p);
    const right = ax < w * 0.55;
    const chars = text.length * 6;
    let x = ax + (right ? 22 : -22);
    x = right ? Math.min(x, w - chars - 6) : Math.max(x, chars + 6);
    const y = Math.max(14, Math.min(h - 54, ay - 24 * up));
    leaders.push({ ax: n1(ax), ay: n1(ay), x: n1(x), y: n1(y), text, right });
  };
  // Machines as legend-like symbols: a footprint and a line or two.
  const foot = (x: number, y: number, l: number, b: number) =>
    line(rect(x - l / 2, y - b / 2, x + l / 2, y + b / 2, 0), true);
  const truck = (x: number, y: number) => {
    foot(x - 0.4, y, 2.6, 1.2);
    line(rect(x + 1, y - 0.55, x + 1.7, y + 0.55, 0), true);
    line([
      [x - 1.7, y, 0],
      [x - 1.7, y, 1],
      [x + 0.9, y, 1],
      [x + 0.9, y, 0],
    ]);
  };
  const machine = (x: number, y: number, arm: Vec3) => {
    foot(x, y, 2.4, 1.4);
    line([[x, y, 0.8], arm]);
  };
  const first = (s: SceneStage) => s.machines.split(',')[0]!;

  const out: StageDrawing[] = [];
  for (const stage of scene.stages) {
    switch (stage.kind) {
      case 'plot': {
        line(rect(-hx, -hy, hx, hy, 0), true, 'chain');
        const m = Math.max(1.2, ground * 0.07);
        dim([-hx, hy, 0], [hx, hy, 0], [0, m, 0], `${fm(L)} м`);
        dim([hx, -hy, 0], [hx, hy, 0], [m, 0, 0], `${fm(W)} м`);
        break;
      }
      case 'prep': {
        const m = built || scene.shape !== 'box' ? 2 : 0;
        line(rect(-hx - m, -hy - m, hx + m, hy + m, 0), true);
        for (let i = 1; i < 8; i++) {
          const x = -hx - m + ((L + 2 * m) * i) / 8;
          line(
            [
              [x, -hy - m, 0],
              [x, hy + m, 0],
            ],
            false,
            'hatch',
          );
        }
        machine(-hx - m - 2, 0, [-hx - m - 0.6, 0, 0.2]);
        leader([-hx - m - 2, 0, 0.8], first(stage));
        leader([0, 0, 0], stage.metric, -1);
        break;
      }
      case 'dig': {
        if (scene.shape === 'box') {
          box(-hx, -hy, -D, hx, hy, 0);
          cutHatch(-hx, -hy, hx, hy, -D);
        } else {
          const o = scene.shape === 'piles' ? 0.25 : 0.4;
          box(-hx - o, -hy - o, -D, hx + o, hy + o, 0);
          box(-hx + o, -hy + o, -D, hx - o, hy - o, 0);
          cutHatch(-hx - o, -hy - o, hx + o, hy + o, -D);
        }
        dim([-hx, -hy, 0], [-hx, -hy, -D], [-Math.max(1, ground * 0.05), 0, 0], `${fm(D)} м`);
        leader([0, -hy, -D], `${first(stage)} · ${fm(scene.volume)} м³`);
        break;
      }
      case 'haul': {
        const x = hx + Math.max(3, ground * 0.12);
        for (let i = 0; i < Math.min(3, Math.max(1, scene.trips)); i++) truck(x, -hy + 1 + i * 2);
        leader([x, -hy + 1, 1], `самосвал · ${stage.metric}`);
        break;
      }
      case 'foundation': {
        if (scene.shape === 'box') box(-hx, -hy, -0.3, hx, hy, 0.3);
        else {
          const o = 0.2;
          box(-hx - o, -hy - o, -D, hx + o, hy + o, 0.3);
          box(-hx + o, -hy + o, -D, hx - o, hy - o, 0.3);
          if (scene.shape === 'piles')
            for (let x = -hx; x <= hx + 0.01; x += Math.max(2, L / 6))
              for (const y of [-hy, hy])
                line([
                  [x, y, -3],
                  [x, y, -D],
                ]);
        }
        leader([hx, hy, 0.3], `бетон ${fm(scene.extra)} м³`);
        break;
      }
      case 'base': {
        line(rect(-hx, -hy, hx, hy, -D / 2), true);
        line(rect(-hx, -hy, hx, hy, 0), true);
        leader([hx, hy, -D / 2], 'песок + щебень');
        break;
      }
      case 'backfill': {
        const k = Math.max(6, Math.round(ground / 1.5));
        for (let i = 0; i <= k; i++) {
          const x = -hx + (L * i) / k;
          for (const y of [-hy, hy])
            line(
              [
                [x - 0.3, y - 0.7, 0],
                [x + 0.3, y + 0.7, 0],
              ],
              false,
              'hatch',
            );
        }
        leader([hx, -hy, 0], stage.metric);
        break;
      }
      case 'walls': {
        const fl = Math.max(1, scene.floors);
        const fh = scene.height / fl;
        for (let k = 0; k < fl; k++) {
          const z0 = 0.3 + k * fh;
          box(-hx, -hy, z0, hx, hy, z0 + fh);
          if (scene.roof === 'gable')
            for (let x = -hx + 1.5; x < hx - 1.2; x += 3)
              line(
                [
                  [x, hy, z0 + 1],
                  [x + 1.2, hy, z0 + 1],
                  [x + 1.2, hy, z0 + 2.2],
                  [x, hy, z0 + 2.2],
                ],
                true,
              );
        }
        dim(
          [-hx, hy, 0.3],
          [-hx, hy, top],
          [-Math.max(1, ground * 0.06), 0, 0],
          `${fm(scene.height)} м`,
        );
        leader([hx, -hy, top], `${first(stage)} · ${stage.metric}`);
        break;
      }
      case 'roof': {
        if (scene.roof === 'gable') {
          line([
            [-hx, 0, top + roofRise],
            [hx, 0, top + roofRise],
          ]);
          for (const x of [-hx, hx])
            line([
              [x, -hy - 0.4, top],
              [x, 0, top + roofRise],
              [x, hy + 0.4, top],
            ]);
          line(rect(-hx - 0.4, -hy - 0.4, hx + 0.4, hy + 0.4, top), true);
        } else box(-hx, -hy, top, hx, hy, top + roofRise);
        leader([hx, 0, top + roofRise], `${first(stage)} · ${stage.metric}`);
        break;
      }
      case 'facade': {
        for (let x = -hx + 1; x < hx; x += 2)
          line(
            [
              [x, hy, 0.3],
              [x, hy, top],
            ],
            false,
            'hatch',
          );
        const bx = -hx + L * 0.3;
        foot(bx, hy + 3.5, 2.6, 1.3);
        line([
          [bx, hy + 3.5, 1],
          [bx, hy + 0.9, top * 0.8],
        ]);
        line(rect(bx - 0.6, hy + 0.3, bx + 0.6, hy + 1.3, top * 0.8), true);
        leader([bx, hy + 3.5, 0], `автовышка · ${stage.metric}`, -1);
        break;
      }
      case 'landscape': {
        const m = 5;
        line(rect(-hx - m, -hy - m, hx + m, hy + m, 0), true, 'chain');
        for (const [x, y] of [
          [-hx - 3, -hy - 3],
          [hx + 3, -hy - 3],
          [-hx - 3, hy + 3],
          [hx + 3, hy + 3],
        ] as const) {
          const pts: Vec3[] = [];
          for (let i = 0; i < 8; i++)
            pts.push([x + Math.cos((i * Math.PI) / 4), y + Math.sin((i * Math.PI) / 4), 0]);
          line(pts, true);
          line([
            [x, y, 0],
            [x, y, 2.2],
          ]);
        }
        foot(0, hy + m - 1.2, 2, 1.2);
        leader([0, hy + m - 1.2, 0], `каток · ${stage.metric}`, -1);
        break;
      }
      case 'pile': {
        const s = hx * 0.75;
        const apex: Vec3 = [0, 0, s * 0.7];
        const base = rect(-s, -s, s, s, 0);
        line(base, true);
        for (const q of base) line([q, apex]);
        leader(apex, `${fm(scene.volume)} м³`);
        break;
      }
      case 'demolish': {
        const th = Math.max(0.2, scene.extra);
        box(-hx, -hy, 0, hx, hy, th);
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3;
          line(
            [
              [0, 0, th],
              [Math.cos(a) * hx * 0.5, Math.sin(a) * hy * 0.6, th],
              [Math.cos(a + 0.3) * hx, Math.sin(a + 0.3) * hy, th],
            ],
            false,
            'hatch',
          );
        }
        machine(-hx - 2, 0, [-hx + 1, 0, th]);
        leader([0, 0, th], `гидромолот · ${stage.metric}`);
        break;
      }
      case 'lift': {
        foot(0, 0, 4, 2);
        const tip: Vec3 = [6, 3, 9];
        line([[0, 0, 0], [0, 0, 9], tip, [6, 3, 7]]);
        box(5.3, 2.3, 6, 6.7, 3.7, 7);
        dim([6, 3, 0], [6, 3, 6], [1.5, 0, 0], '6 м');
        leader([6.7, 3, 6.5], `автокран · ${stage.metric}`);
        break;
      }
      case 'kmu': {
        truck(-2, 0);
        line([
          [-0.5, 0, 1],
          [1, 0, 3],
          [2.7, 0, 2],
        ]);
        box(2, -0.6, 0, 3.4, 0.6, 1.2);
        leader([2.7, 0, 1.2], `КМУ · ${stage.metric}`);
        break;
      }
      case 'height': {
        box(-hx, -0.2, 0, hx, 0.2, scene.height);
        foot(-1, 3.5, 2.6, 1.3);
        line([
          [-1, 3.5, 1],
          [0, 1, scene.height - 2],
        ]);
        line(rect(-0.6, 0.4, 0.6, 1.4, scene.height - 2), true);
        dim([hx, 0, 0], [hx, 0, scene.height], [1.5, 0, 0], `${fm(scene.height)} м`);
        leader([0, 1, scene.height - 2], `автовышка · ${stage.metric}`);
        break;
      }
      case 'compact': {
        line(rect(-hx, -hy, hx, hy, 0), true);
        for (let i = 1; i < 6; i++) {
          const y = -hy + (W * i) / 6;
          line(
            [
              [-hx, y, 0],
              [hx, y, 0],
            ],
            false,
            'hatch',
          );
        }
        foot(-hx + 1.5, -hy + 1, 2, 1.2);
        leader([-hx + 1.5, -hy + 1, 0], `каток · ${stage.metric}`);
        break;
      }
      case 'snow': {
        const sd = Math.max(0.3, scene.extra);
        box(-hx, -hy, 0, hx, hy, sd);
        leader([hx, hy, sd], stage.metric);
        break;
      }
    }
    out.push({ ...cur, dimTexts, leaders });
    cur = { d: '', chain: '', hatch: '', dims: '' };
    dimTexts = [];
    leaders = [];
  }
  return { w, h, scale: scaleLabel(v.scale), stages: out };
}
