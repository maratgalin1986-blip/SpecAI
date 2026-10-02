import { describe, expect, it } from 'vitest';
import {
  designQuery,
  designSummary,
  generateDesign,
  normalizeParams,
  parseDesignQuery,
  smetaHref,
} from '@/lib/design';
import { buildLandscape, landscapeQuantities } from '@/lib/design/landscape';
import { buildBuilding, sharedEdge, slice, WET_KINDS } from '@/lib/design/layout';
import { PRESETS } from '@/lib/design/presets';
import { rng } from '@/lib/design/random';
import { buildSpec, openingArea, reserveFor, wallFinishArea, windowArea } from '@/lib/design/spec';
import {
  FINISH_BASE,
  FINISH_GROUP,
  finishFor,
  FURNITURE,
  paletteFor,
  STYLES,
  STYLE_IDS,
} from '@/lib/design/styles';
import type { Building, DesignParams, FloorPlan } from '@/lib/design/types';

const BUILDINGS: DesignParams[] = [
  ...PRESETS.filter((p) => p.params.object !== 'landscape').map((p) => p.params),
  { object: 'house', length: 6, width: 6, floors: 1, rooms: 5, style: 'eco', budget: 'econom' },
  {
    object: 'house',
    length: 18,
    width: 14,
    floors: 2,
    rooms: 5,
    style: 'classic',
    budget: 'premium',
  },
  { object: 'house', length: 14, width: 6, floors: 1, rooms: 3, style: 'loft', budget: 'mid' },
  { object: 'flat', length: 16, width: 12, floors: 1, rooms: 4, style: 'modern', budget: 'mid' },
  { object: 'flat', length: 5, width: 4, floors: 1, rooms: 1, style: 'minimal', budget: 'mid' },
  { object: 'garage', length: 4, width: 3, floors: 2, rooms: 3, style: 'loft', budget: 'econom' },
  {
    object: 'garage',
    length: 14,
    width: 10,
    floors: 2,
    rooms: 3,
    style: 'modern',
    budget: 'premium',
  },
  { object: 'banya', length: 3, width: 2, floors: 1, rooms: 0, style: 'eco', budget: 'econom' },
  {
    object: 'banya',
    length: 9,
    width: 6,
    floors: 1,
    rooms: 0,
    style: 'classic',
    budget: 'premium',
  },
];
const SEEDS = [1, 2, 3, 17, 4242, 99991];

const cases = BUILDINGS.flatMap((p) =>
  SEEDS.map((seed) => ({
    p: normalizeParams(p),
    seed,
    b: buildBuilding(normalizeParams(p), rng(seed)),
  })),
);
const label = (p: DesignParams, seed: number) =>
  `${p.object} ${p.length}×${p.width} f${p.floors} r${p.rooms} seed ${seed}`;

/** Unique partition length, from both sides of every shared edge. */
const partitionLength = (f: FloorPlan) =>
  f.partitions.reduce((s, e) => s + Math.hypot(e.x2 - e.x1, e.y2 - e.y1), 0);

describe('room layout', () => {
  it('tiles the inner footprint with planning cells', () => {
    for (const { p, seed, b } of cases) {
      const inner = (b.L - 2 * b.ext) * (b.W - 2 * b.ext);
      for (const f of b.floors) {
        const cells = f.rooms.reduce((s, r) => s + r.cell.w * r.cell.h, 0);
        expect(cells, label(p, seed)).toBeCloseTo(inner, 4);
        for (const r of f.rooms) {
          expect(r.cell.w, `${label(p, seed)} ${r.name}`).toBeGreaterThan(0.5);
          expect(r.cell.x).toBeGreaterThanOrEqual(b.ext - 1e-6);
          expect(r.cell.x + r.cell.w).toBeLessThanOrEqual(b.L - b.ext + 1e-6);
        }
      }
    }
  });

  it('room areas sum to the footprint minus walls within tolerance', () => {
    for (const { p, seed, b } of cases) {
      const inner = (b.L - 2 * b.ext) * (b.W - 2 * b.ext);
      for (const f of b.floors) {
        const rooms = f.rooms.reduce((s, r) => s + r.area, 0);
        const expected = inner - partitionLength(f) * b.part;
        // Rounding to 0.1 м² per room and partition crossings.
        expect(Math.abs(rooms - expected), label(p, seed)).toBeLessThan(
          0.06 * f.rooms.length + 0.2,
        );
        expect(rooms).toBeLessThanOrEqual(
          b.L * b.W - (2 * (b.L + b.W) - 4 * b.ext) * b.ext + 0.05 * f.rooms.length,
        );
      }
    }
  });

  it('gives every room a door, and every door joins neighbouring rooms', () => {
    for (const { p, seed, b } of cases) {
      for (const f of b.floors) {
        for (const r of f.rooms) {
          expect(
            f.doors.some((d) => d.rooms.includes(r.id)),
            `${label(p, seed)}: ${r.name} has no door`,
          ).toBe(true);
        }
        for (const d of f.doors) {
          if (d.rooms[1] === null) continue;
          const a = f.rooms.find((r) => r.id === d.rooms[0])!;
          const c = f.rooms.find((r) => r.id === d.rooms[1])!;
          const e = sharedEdge(a.cell, c.cell);
          expect(e, label(p, seed)).not.toBeNull();
          const len = Math.hypot(e!.x2 - e!.x1, e!.y2 - e!.y1);
          expect(d.width).toBeLessThanOrEqual(len);
        }
      }
    }
  });

  it('connects every room to the entrance (or the stair upstairs)', () => {
    for (const { p, seed, b } of cases) {
      b.floors.forEach((f, i) => {
        const start = f.doors
          .filter((d) => d.rooms[1] === null)
          .map((d) => d.rooms[0])
          .concat(i > 0 ? f.rooms.filter((r) => r.kind === 'stair').map((r) => r.id) : []);
        expect(start.length, label(p, seed)).toBeGreaterThan(0);
        const seen = new Set(start);
        let grew = true;
        while (grew) {
          grew = false;
          for (const d of f.doors) {
            const [x, y] = d.rooms;
            if (y === null) continue;
            if (seen.has(x) !== seen.has(y)) {
              seen.add(x);
              seen.add(y);
              grew = true;
            }
          }
        }
        expect(seen.size, label(p, seed)).toBe(f.rooms.length);
      });
    }
  });

  it('keeps wet rooms of a floor next to each other', () => {
    for (const { p, seed, b } of cases) {
      for (const f of b.floors) {
        const wet = f.rooms.filter((r) => WET_KINDS.includes(r.kind));
        if (wet.length < 2) continue;
        const group = new Set([wet[0]!.id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const r of wet) {
            if (group.has(r.id)) continue;
            if (wet.some((o) => group.has(o.id) && sharedEdge(o.cell, r.cell))) {
              group.add(r.id);
              grew = true;
            }
          }
        }
        expect(group.size, label(p, seed)).toBe(wet.length);
      }
    }
  });

  it('opens wet-room doors outwards and puts windows on outer walls', () => {
    for (const { p, seed, b } of cases) {
      for (const f of b.floors) {
        for (const w of f.windows) {
          const onOuter =
            Math.abs(w.y - b.ext / 2) < 1e-6 ||
            Math.abs(w.y - (b.W - b.ext / 2)) < 1e-6 ||
            Math.abs(w.x - b.ext / 2) < 1e-6 ||
            Math.abs(w.x - (b.L - b.ext / 2)) < 1e-6;
          expect(onOuter, label(p, seed)).toBe(true);
        }
        for (const d of f.doors.filter((d) => d.kind === 'door')) {
          const room = f.rooms.find((r) => r.id === d.rooms[0])!;
          if (!room.wet) continue;
          const c = room.cell;
          const into =
            d.axis === 'x' ? (c.y + c.h / 2 > d.y ? 1 : -1) : c.x + c.w / 2 > d.x ? 1 : -1;
          expect(d.swing, label(p, seed)).toBe(-into);
        }
      }
    }
  });

  it('keeps the stair in the same place on both floors', () => {
    for (const { p, seed, b } of cases.filter((c) => c.b.floors.length > 1)) {
      const [s1, s2] = b.floors.map((f) => f.rooms.find((r) => r.kind === 'stair')?.cell);
      expect(s1, label(p, seed)).toBeDefined();
      expect(s2).toEqual(s1);
    }
  });

  it('slices a band in proportion to targets, respecting minimum widths', () => {
    const edges = slice(0, 10, 3, [
      { kind: 'bedroom', name: 'a', target: 12, minW: 2, optional: 0 },
      { kind: 'bedroom', name: 'b', target: 12, minW: 2, optional: 0 },
      { kind: 'wc', name: 'c', target: 0.5, minW: 1.2, optional: 0 },
    ]);
    expect(edges[0]).toBe(0);
    expect(edges[3]).toBe(10);
    expect(edges[3]! - edges[2]!).toBeCloseTo(1.2, 5);
    expect(edges[1]! - edges[0]!).toBeCloseTo(edges[2]! - edges[1]!, 1);
  });
});

describe('determinism', () => {
  it('gives the same project for the same params and seed', () => {
    for (const preset of PRESETS) {
      const a = generateDesign(preset.params, preset.seed);
      const b = generateDesign(preset.params, preset.seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('gives a different variant for another seed', () => {
    const params = PRESETS[0]!.params;
    const plans = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        JSON.stringify(generateDesign(params, seed).building!.floors[0]!.rooms.map((r) => r.cell)),
      ),
    );
    expect(plans.size).toBeGreaterThan(2);
  });

  it('round-trips params and seed through the page query', () => {
    const p = normalizeParams({
      object: 'garage',
      length: 9,
      width: 6,
      floors: 2,
      rooms: 2,
      style: 'loft',
    });
    const q = Object.fromEntries(new URLSearchParams(designQuery(p, 77)));
    expect(parseDesignQuery(q)).toEqual({ params: p, seed: 77 });
    expect(parseDesignQuery({})).toBeNull();
  });

  it('normalizes params: clamps sizes and lays buildings along the long side', () => {
    const p = normalizeParams({ object: 'house', length: 6, width: 12, floors: 9, rooms: -1 });
    expect(p.length).toBe(12);
    expect(p.width).toBe(6);
    expect(p.floors).toBe(2);
    expect(p.rooms).toBe(1);
    expect(normalizeParams({ object: 'nope' as never }).object).toBe('house');
  });
});

describe('specification maths', () => {
  it('computes wall finishing as perimeter × height minus openings', () => {
    expect(wallFinishArea(14, 2.7, 0)).toBeCloseTo(37.8);
    expect(wallFinishArea(14, 2.7, 0.8 * 2.1 + 1.4 * 1.5)).toBeCloseTo(37.8 - 1.68 - 2.1, 1);
    expect(wallFinishArea(1, 1, 5)).toBe(0);
    expect(openingArea({ width: 0.8, kind: 'door' })).toBeCloseTo(1.68);
    expect(openingArea({ width: 2.5, kind: 'gate' })).toBeCloseTo(5.75);
    expect(windowArea({ width: 1.5, height: 1.4 })).toBeCloseTo(2.1);
  });

  it('sums rows, openings and materials consistently', () => {
    for (const { b, p } of cases.slice(0, 30)) {
      const spec = buildSpec(b, p.style, p.budget);
      const rooms = b.floors.flatMap((f) => f.rooms);
      expect(spec.rows).toHaveLength(rooms.length);
      expect(spec.totals.area).toBeCloseTo(
        rooms.reduce((s, r) => s + r.area, 0),
        1,
      );
      expect(spec.totals.openings).toBe(spec.totals.doors + spec.totals.windows);
      for (const row of spec.rows) {
        const height = b.ceiling;
        expect(row.walls).toBeLessThanOrEqual(row.perimeter * height + 0.05);
        expect(row.ceiling).toBe(row.area);
      }
      const floorSum = spec.materials
        .filter((m) => m.surface === 'Пол')
        .reduce((s, m) => s + m.area, 0);
      expect(floorSum).toBeCloseTo(spec.totals.area, 0);
      for (const m of spec.materials) {
        expect(m.order).toBeGreaterThanOrEqual(m.area);
        expect(m.order).toBeLessThanOrEqual(Math.ceil(m.area * 1.12) + 1e-9);
      }
    }
  });

  it('subtracts a room’s own openings from its walls', () => {
    const b: Building = buildBuilding(normalizeParams(PRESETS[0]!.params), rng(108));
    const spec = buildSpec(b, 'scandi', 'mid');
    const f = b.floors[0]!;
    for (const row of spec.rows) {
      const room = f.rooms.find((r) => r.id === row.id)!;
      const openings =
        f.doors.filter((d) => d.rooms.includes(room.id)).reduce((s, d) => s + openingArea(d), 0) +
        f.windows.filter((w) => w.room === room.id).reduce((s, w) => s + windowArea(w), 0);
      expect(row.walls).toBeCloseTo(wallFinishArea(row.perimeter, b.ceiling, openings), 5);
    }
  });

  it('uses a bigger reserve for tiles than for paint', () => {
    expect(reserveFor('Пол', 'Керамогранит 60×60')).toBe(0.12);
    expect(reserveFor('Пол', 'Ламинат')).toBe(0.1);
    expect(reserveFor('Стены', 'Краска')).toBe(0.05);
  });
});

describe('style dictionary', () => {
  it('has a full palette of 5 valid swatches for every style and seed', () => {
    for (const id of STYLE_IDS) {
      for (let i = 0; i < 3; i++) {
        const pal = paletteFor(id, i);
        expect(pal).toHaveLength(5);
        for (const s of pal) {
          expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
          expect(s.name.length).toBeGreaterThan(2);
        }
        expect(new Set(pal.map((s) => s.hex)).size).toBe(5);
      }
    }
  });

  it('has finishes for every room kind, style and budget', () => {
    for (const kind of Object.keys(FINISH_GROUP) as (keyof typeof FINISH_GROUP)[]) {
      expect(FURNITURE[kind].length).toBeGreaterThan(10);
      for (const style of STYLE_IDS) {
        for (const budget of ['econom', 'mid', 'premium'] as const) {
          const f = finishFor(kind, style, budget);
          expect(f.floor && f.walls && f.ceiling).toBeTruthy();
        }
      }
    }
    for (const base of Object.values(FINISH_BASE)) {
      expect(new Set([base.floor.econom, base.floor.mid, base.floor.premium]).size).toBe(3);
    }
  });

  it('adds the style tone and the style ceiling', () => {
    expect(finishFor('bedroom', 'loft', 'mid').floor).toContain(STYLES.loft.tones.floor);
    expect(finishFor('bedroom', 'loft', 'mid').ceiling).toBe(STYLES.loft.ceiling);
    expect(finishFor('bedroom', 'loft', 'econom').ceiling).not.toBe(STYLES.loft.ceiling);
    expect(finishFor('bath', 'classic', 'premium').walls).toContain('мрамор');
    expect(finishFor('steam', 'modern', 'mid').walls).toContain('липа');
  });
});

describe('landscape', () => {
  const plots = [
    { length: 40, width: 25 },
    { length: 30, width: 20 },
    { length: 16, width: 16 },
    { length: 80, width: 60 },
    { length: 20, width: 50 },
  ];
  it('keeps zones inside the plot, apart, and the house 5 m from the street and 3 m from neighbours', () => {
    for (const size of plots) {
      for (const seed of SEEDS) {
        const p = normalizeParams({ object: 'landscape', ...size });
        const l = buildLandscape(p, rng(seed));
        for (const z of l.zones) {
          expect(z.rect.x).toBeGreaterThanOrEqual(-1e-6);
          expect(z.rect.y).toBeGreaterThanOrEqual(-1e-6);
          expect(z.rect.x + z.rect.w).toBeLessThanOrEqual(l.W + 1e-6);
          expect(z.rect.y + z.rect.h).toBeLessThanOrEqual(l.L + 1e-6);
        }
        for (let i = 0; i < l.zones.length; i++) {
          for (let j = i + 1; j < l.zones.length; j++) {
            const a = l.zones[i]!.rect;
            const b = l.zones[j]!.rect;
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            expect(ox > 1e-6 && oy > 1e-6, `${l.zones[i]!.kind} × ${l.zones[j]!.kind}`).toBe(false);
          }
        }
        const house = l.zones.find((z) => z.kind === 'house')!.rect;
        expect(l.L - (house.y + house.h)).toBeGreaterThanOrEqual(5);
        expect(Math.min(house.x, l.W - house.x - house.w)).toBeGreaterThanOrEqual(3);
        const used = l.zones.reduce((s, z) => s + z.area, 0);
        expect(l.openLawn).toBeCloseTo(l.W * l.L - used, 0);
      }
    }
  });

  it('has a driveway, parking, paths and a lawn, with quantities', () => {
    const d = generateDesign(PRESETS.find((p) => p.id === 'landscape-10')!.params, 1010);
    const kinds = new Set(d.landscape!.zones.map((z) => z.kind));
    for (const k of ['driveway', 'parking', 'path', 'terrace', 'beds', 'playground'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    const q = landscapeQuantities(d.landscape!, 'mid');
    const lawn = q.find((x) => x.name.startsWith('Газон'))!;
    expect(lawn.value).toBe(d.landscape!.lawn);
    const seed = q.find((x) => x.name.startsWith('Семена'))!;
    expect(seed.value).toBeCloseTo(lawn.value * 0.04, 1);
    const dig = q.find((x) => x.name.startsWith('Выемка'))!.value;
    expect(q.find((x) => x.name.startsWith('Вывоз'))!.value).toBe(Math.ceil((dig * 1.2) / 10));
  });
});

describe('funnel and summary', () => {
  it('passes dimensions to /smeta for buildings', () => {
    const p = normalizeParams({ object: 'house', length: 12, width: 10, floors: 2 });
    expect(smetaHref(p)).toBe('/smeta?object=house&length=12&width=10&floors=2');
    expect(smetaHref(p, true)).toBe('/smeta?mode=snab&object=house&length=12&width=10&floors=2');
    expect(smetaHref(normalizeParams({ object: 'landscape' }))).toBe('/smeta?job=planning');
    expect(smetaHref(normalizeParams({ object: 'flat' }), true)).toBe('/smeta?mode=snab');
  });

  it('summarises the project under 1000 characters with the brand and the link', () => {
    for (const preset of PRESETS) {
      const d = generateDesign(preset.params, preset.seed);
      const text = designSummary(d, 'СпецПласт16', 'https://example.test/dizain?o=house');
      expect(text.length).toBeLessThanOrEqual(1000);
      expect(text).toContain('СпецПласт16');
      expect(text).not.toContain('СП16');
      expect(text.endsWith('https://example.test/dizain?o=house')).toBe(true);
    }
  });
});
