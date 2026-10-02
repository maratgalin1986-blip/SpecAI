import { between, chance, round, type Rand } from '@/lib/design/random';
import { STYLES } from '@/lib/design/styles';
import type {
  Axis,
  Building,
  DesignParams,
  Door,
  FloorPlan,
  Rect,
  Room,
  RoomKind,
  Roof,
  Segment,
  Win,
  Zone,
} from '@/lib/design/types';

// Room layout of a building, the way an architect starts a sketch:
//
// 1. A room programme from the object, the number of rooms and floors.
// 2. Houses and flats: the big day room (кухня-гостиная) takes one end of the
//    footprint at full depth; the rest is split into bands along the long
//    side — a north band (wet rooms, stair, storage), a corridor, a south band
//    (bedrooms). Narrow footprints get one band with the corridor along the
//    north wall. Every band is sliced across in proportion to the target
//    areas (a one-level treemap) with minimum widths.
// 3. Baths and garages: rooms in a row (enfilade), each opening into the next.
// 4. Wet rooms go next to each other at the end of the band nearest the
//    kitchen (one riser); their doors open outwards, as the norms ask.
// 5. Doors to the corridor or the previous room, the entrance from outside,
//    windows on the outer walls by room kind and style.

const EPS = 1e-6;
const GRID = 0.05;
const snap = (n: number) => Math.round(n / GRID) * GRID;

export const WET_KINDS: RoomKind[] = ['bath', 'wc', 'wash', 'steam'];

interface Req {
  kind: RoomKind;
  name: string;
  /** Target area, м². */
  target: number;
  /** Minimum width across the band, m. */
  minW: number;
  /** Fixed width across the band (stairs), m. */
  fixedW?: number;
  /** Drop order when the band is too short: higher goes first, 0 — never. */
  optional: number;
}

const req = (
  kind: RoomKind,
  name: string,
  target: number,
  minW: number,
  optional = 0,
  fixedW?: number,
): Req => ({ kind, name, target, minW, optional, fixedW });

const BEDROOM_NAMES = ['Спальня', 'Детская', 'Спальня 2', 'Кабинет', 'Гостевая'];
const BEDROOM_KINDS: RoomKind[] = ['bedroom', 'kids', 'bedroom', 'cabinet', 'bedroom'];

const bedroomReqs = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => {
    const k = Math.min(from + i, BEDROOM_NAMES.length - 1);
    const kind = BEDROOM_KINDS[k]!;
    return req(
      kind,
      BEDROOM_NAMES[k]!,
      kind === 'cabinet' ? 9 : 12.5,
      kind === 'cabinet' ? 2.2 : 2.4,
    );
  });

export interface ObjectSpec {
  title: string;
  length: [number, number, number];
  width: [number, number, number];
  floors: [number, number];
  rooms: [number, number, number];
  roomsLabel: string;
  ext: number;
  part: number;
  ceiling: number;
}

export const OBJECT_SPECS: Record<DesignParams['object'], ObjectSpec> = {
  house: {
    title: 'Дом',
    length: [6, 18, 10],
    width: [6, 14, 8],
    floors: [1, 2],
    rooms: [1, 5, 2],
    roomsLabel: 'Спален',
    ext: 0.4,
    part: 0.12,
    ceiling: 2.8,
  },
  banya: {
    title: 'Баня',
    length: [3, 9, 6],
    width: [2, 6, 4],
    floors: [1, 1],
    rooms: [0, 0, 0],
    roomsLabel: '',
    ext: 0.2,
    part: 0.1,
    ceiling: 2.2,
  },
  garage: {
    title: 'Гараж',
    length: [4, 14, 8],
    width: [3, 10, 6],
    floors: [1, 2],
    rooms: [1, 3, 1],
    roomsLabel: 'Машиномест',
    ext: 0.3,
    part: 0.12,
    ceiling: 3,
  },
  flat: {
    title: 'Комната / квартира',
    length: [4, 16, 9],
    width: [3, 12, 6],
    floors: [1, 1],
    rooms: [0, 4, 2],
    roomsLabel: 'Жилых комнат (0 — одно помещение)',
    ext: 0.3,
    part: 0.1,
    ceiling: 2.7,
  },
  landscape: {
    title: 'Ландшафт участка',
    length: [16, 80, 40],
    width: [16, 60, 25],
    floors: [0, 0],
    rooms: [0, 0, 0],
    roomsLabel: '',
    ext: 0,
    part: 0,
    ceiling: 0,
  },
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** Slice [x0, x1] across a band in proportion to target areas, with minimums. */
export function slice(x0: number, x1: number, depth: number, reqs: Req[]): number[] {
  const len = x1 - x0;
  const widths = reqs.map((r) => r.fixedW ?? 0);
  const free = new Set(reqs.map((_, i) => i).filter((i) => reqs[i]!.fixedW === undefined));
  // Water-filling: rooms that would fall under their minimum get it fixed.
  for (let pass = 0; pass < reqs.length + 1; pass++) {
    const fixed = widths.reduce((s, w, i) => (free.has(i) ? s : s + w), 0);
    const total = [...free].reduce((s, i) => s + reqs[i]!.target / Math.max(depth, 1), 0);
    const left = len - fixed;
    let changed = false;
    for (const i of free) {
      const w = total > 0 ? (left * reqs[i]!.target) / Math.max(depth, 1) / total : 0;
      if (w < reqs[i]!.minW - EPS) {
        widths[i] = reqs[i]!.minW;
        free.delete(i);
        changed = true;
      } else widths[i] = w;
    }
    if (!changed) break;
  }
  // If nothing is free, the last room takes the rest.
  const sum = widths.reduce((s, w) => s + w, 0);
  if (widths.length) widths[widths.length - 1]! += len - sum;
  // Boundaries on a 5 cm grid; the last one is exact.
  const edges = [x0];
  let acc = x0;
  widths.forEach((w, i) => {
    acc += w;
    edges.push(i === widths.length - 1 ? x1 : snap(acc));
  });
  return edges;
}

const minLen = (reqs: Req[]) => reqs.reduce((s, r) => s + (r.fixedW ?? r.minW), 0);

interface Cell {
  req: Req;
  rect: Rect;
}

interface DoorPlan {
  /** Index of the room cell. */
  room: number;
  /** Index of the other cell, or -1 for outside. */
  to: number;
  kind: Door['kind'];
}

interface FloorDraft {
  cells: Cell[];
  doors: DoorPlan[];
  /** Index of the cell with the entrance, if any. */
  entrance: number;
  /** Side of the entrance on the inner rectangle. */
  entranceSide: 'W' | 'N' | 'S';
  zones: Map<number, Zone[]>;
  notes: string[];
}

interface CorridorFrame {
  /** Width of the end room; 0 — sized from the bands of this floor. */
  endW: number;
  double: boolean;
  northDepth: number;
  cw: number;
  /** Slack of the bands over their target length (1.0–1.15). */
  stretch?: number;
  /** Rooms that fill a band much shorter than the other one. */
  fillers?: { north: Req[]; south: Req[] };
}

const desired = (reqs: Req[], depth: number) =>
  reqs.reduce((t, q) => t + (q.fixedW ?? Math.max(q.minW, q.target / Math.max(depth, 1))), 0);

/**
 * Corridor scheme of one floor in inner coordinates (0..A × 0..B, before the
 * mirror): `end` at x ∈ [A − endW, A], the bands and the corridor before it.
 */
function corridorFloor(
  A: number,
  B: number,
  end: Req,
  north: Req[],
  south: Req[],
  frame: CorridorFrame,
  entrance: boolean,
  notes: string[],
): FloorDraft {
  let { endW } = frame;
  const { double, northDepth: nd, cw } = frame;
  let n = [...north];
  let s = [...south];
  if (endW <= 0) {
    // Size the end room from this floor's bands; fill a band that would
    // otherwise be stretched to almost twice its rooms.
    const dS = double ? B - nd - cw : B - cw;
    if (double && frame.fillers) {
      const fn = [...frame.fillers.north];
      const fs = [...frame.fillers.south];
      const taken = (list: Req[]) => {
        while (list.length && [...n, ...s].some((q) => q.name === list[0]!.name)) list.shift();
      };
      for (let k = 0; k < 2; k++) {
        taken(fn);
        taken(fs);
        if (fn.length && desired(n, nd) < 0.5 * desired(s, dS)) {
          const wetAt = n.findIndex((q) => WET_KINDS.includes(q.kind));
          n.splice(wetAt >= 0 ? wetAt : n.length, 0, fn.shift()!);
        }
        if (fs.length && desired(s, dS) < 0.5 * desired(n, nd)) s.push(fs.shift()!);
      }
    }
    const len = double ? Math.max(desired(n, nd), desired(s, dS)) : desired([...s, ...n], dS);
    // The end room takes the rest, but not much more than twice its target:
    // past that the bands grow instead (a 50 м² bedroom helps nobody).
    const cap = Math.max(3.2, (end.target * 2) / B);
    endW = snap(clamp(A - len * (frame.stretch ?? 1.05), 3.2, Math.max(3.2, Math.min(cap, A - 1))));
  }
  if (!double) {
    // One band: wet rooms go to the end near the kitchen.
    s = [...s, ...n];
    n = [];
  }
  const R = () => A - endW;
  // Make the bands fit, softest step first: move a dry room to the other
  // band, drop optional rooms, drop extra bedrooms, shrink the day room,
  // drop the boiler room, and at last the remaining bedroom. The bath stays.
  const isDry = (q: Req) => ['bedroom', 'kids', 'cabinet'].includes(q.kind);
  const over = (band: Req[]) => minLen(band) > R() + EPS;
  const drop = (pred: (q: Req) => boolean, why: string) => {
    for (const band of [n, s]) {
      if (!over(band)) continue;
      let idx = -1;
      band.forEach((q, i) => {
        if (pred(q) && (idx < 0 || q.optional >= band[idx]!.optional)) idx = i;
      });
      if (idx >= 0) {
        notes.push(`${band[idx]!.name}: ${why}`);
        band.splice(idx, 1);
        return true;
      }
    }
    return false;
  };
  const shrink = (min: number) => {
    if (endW <= min + EPS) return false;
    endW = Math.max(min, A - Math.max(minLen(n), minLen(s)));
    return true;
  };
  for (let guard = 0; guard < 30; guard++) {
    if (!over(n) && !over(s)) break;
    const from = over(n) ? n : s;
    const to = from === n ? s : n;
    const movable = from.findIndex(isDry);
    if (double && movable >= 0 && minLen(to) + from[movable]!.minW <= R() + EPS) {
      const [moved] = from.splice(movable, 1);
      // Dry rooms go before the wet group of the north band.
      const wetAt = to.findIndex((q) => WET_KINDS.includes(q.kind));
      to.splice(wetAt >= 0 ? wetAt : to.length, 0, moved!);
      continue;
    }
    if (drop((q) => q.optional >= 2, 'не уместилось на этом этаже')) continue;
    if ([...n, ...s].filter(isDry).length > 1 && drop(isDry, 'не уместилась — увеличьте размеры'))
      continue;
    if (shrink(3)) continue;
    if (drop((q) => q.optional >= 1, 'не уместилось на этом этаже')) continue;
    if (shrink(2.4)) continue;
    if (drop(isDry, 'не уместилась — увеличьте размеры')) continue;
    break;
  }
  const cells: Cell[] = [];
  const doors: DoorPlan[] = [];
  const corridorY0 = double ? nd : 0;
  const corridorY1 = corridorY0 + cw;
  const r = R();
  const hasCorridor = r > 0.8;
  if (!hasCorridor && (n.length || s.length)) {
    notes.push('Места хватило только на одно помещение — увеличьте размеры');
  }
  const endX = hasCorridor ? r : 0;
  const hallReq = req('hall', entrance ? 'Холл, прихожая' : 'Коридор', 0, 0);
  const hall = hasCorridor
    ? cells.push({ req: hallReq, rect: { x: 0, y: corridorY0, w: r, h: cw } }) - 1
    : -1;
  const addBand = (band: Req[], y0: number, y1: number, toCorridor: boolean) => {
    if (!band.length || !hasCorridor) return;
    const edges = slice(0, r, y1 - y0, band);
    band.forEach((rq, i) => {
      const idx =
        cells.push({
          req: rq,
          rect: { x: edges[i]!, y: y0, w: edges[i + 1]! - edges[i]!, h: y1 - y0 },
        }) - 1;
      if (toCorridor) doors.push({ room: idx, to: hall, kind: 'door' });
    });
  };
  if (double) addBand(n, 0, nd, true);
  addBand(s, corridorY1, B, true);
  // Without a corridor on a single-band floor the band still needs a corridor
  // strip at the north: when the band is missing, the hall is just a strip.
  const endIdx = cells.push({ req: end, rect: { x: endX, y: 0, w: A - endX, h: B } }) - 1;
  if (hall >= 0) {
    doors.push({ room: endIdx, to: hall, kind: end.kind === 'living' ? 'opening' : 'door' });
  }
  const entranceCell = entrance ? (hall >= 0 ? hall : endIdx) : -1;
  if (entranceCell >= 0) doors.push({ room: entranceCell, to: -1, kind: 'entrance' });
  // The day room: kitchen to the north (riser), living to the sunny south.
  const zones = new Map<number, Zone[]>();
  if (end.kind === 'living') {
    const e = cells[endIdx]!.rect;
    const k = snap(e.h * 0.36);
    const d = snap(e.h * 0.24);
    zones.set(endIdx, [
      { name: 'Кухня', rect: { x: e.x, y: e.y, w: e.w, h: k } },
      { name: 'Столовая', rect: { x: e.x, y: e.y + k, w: e.w, h: d } },
      { name: 'Гостиная', rect: { x: e.x, y: e.y + k + d, w: e.w, h: e.h - k - d } },
    ]);
  }
  return { cells, doors, entrance: entranceCell, entranceSide: 'W', zones, notes };
}

/** Rooms in a row across the full depth; each opens into the previous one. */
function rowFloor(A: number, B: number, reqs: Req[], widths?: number[]): FloorDraft {
  const edges = widths
    ? widths.reduce<number[]>(
        (acc, w, i) => [...acc, i === widths.length - 1 ? A : snap(acc[i]! + w)],
        [0],
      )
    : slice(0, A, B, reqs);
  const cells = reqs.map((rq, i) => ({
    req: rq,
    rect: { x: edges[i]!, y: 0, w: edges[i + 1]! - edges[i]!, h: B },
  }));
  const doors: DoorPlan[] = cells
    .slice(1)
    .map((_, i) => ({ room: i + 1, to: i, kind: 'door' as const }));
  return { cells, doors, entrance: 0, entranceSide: 'W', zones: new Map(), notes: [] };
}

function housePlans(p: DesignParams, A: number, B: number, r: Rand) {
  const double = B >= 7 - EPS;
  const frame: CorridorFrame = {
    endW: 0,
    double,
    northDepth: snap(clamp(B * between(r, 0.32, 0.38), 2.2, 3.4)),
    cw: 1.2,
  };
  const stair = req('stair', 'Лестница', 0, 2.4, 0, 2.6);
  const living = req('living', 'Кухня-гостиная', 28, 3.2);
  const bedrooms = p.rooms;
  const shuffle = (list: Req[]) => (chance(r, 0.5) ? list : [...list].reverse());
  const notes: string[] = [];
  const fillers = {
    north: [req('wardrobe', 'Гардеробная', 4, 1.4, 3), req('storage', 'Постирочная', 4, 1.4, 3)],
    south: [req('bedroom', 'Гостевая', 12, 2.6, 3), req('cabinet', 'Кабинет', 9, 2.2, 3)],
  };
  const f: CorridorFrame = { ...frame, stretch: between(r, 1.0, 1.15), fillers };
  if (p.floors <= 1) {
    const north = [
      ...(bedrooms >= 2 ? [req('storage', 'Кладовая', 3, 1.2, 3)] : []),
      req('boiler', 'Котельная', 4, 1.6, 1),
      ...(bedrooms >= 3 ? [req('wc', 'Санузел', 2.6, 1.2, 2)] : []),
      req('bath', bedrooms >= 3 ? 'Ванная' : 'Санузел', 5, 1.7),
    ];
    const south = shuffle(bedroomReqs(bedrooms));
    return { floors: [corridorFloor(A, B, living, north, south, f, true, notes)], notes };
  }
  const north1 = [
    stair,
    req('boiler', 'Котельная', 4, 1.6, 1),
    req('wc', 'Гостевой санузел', 2.6, 1.2, 2),
  ];
  const south1 = [req('cabinet', 'Кабинет, гостевая', 10, 2.4, 1)];
  const north2 = [stair, req('wardrobe', 'Гардероб', 4, 1.4, 3), req('bath', 'Ванная', 5.5, 1.7)];
  const south2 = shuffle(
    bedrooms > 1 ? bedroomReqs(bedrooms - 1, 1) : [req('cabinet', 'Кабинет', 9, 2.2, 1)],
  );
  const master = req('bedroom', 'Спальня (мастер)', 16, 3.2);
  return {
    floors: [
      corridorFloor(A, B, living, north1, south1, f, true, notes),
      corridorFloor(A, B, master, north2, south2, f, false, notes),
    ],
    notes,
  };
}

function flatPlans(p: DesignParams, A: number, B: number, r: Rand) {
  const notes: string[] = [];
  if (p.rooms <= 0) {
    const draft = rowFloor(A, B, [req('living', 'Кухня-гостиная', A * B, 1)]);
    const k = snap(A * between(r, 0.3, 0.38));
    const d = snap(A * 0.22);
    const order = chance(r, 0.5);
    const zone = (name: string, x: number, w: number): Zone => ({
      name,
      rect: { x, y: 0, w, h: B },
    });
    draft.zones.set(
      0,
      order
        ? [zone('Кухня', 0, k), zone('Столовая', k, d), zone('Гостиная', k + d, A - k - d)]
        : [zone('Гостиная', 0, A - k - d), zone('Столовая', A - k - d, d), zone('Кухня', A - k, k)],
    );
    draft.entranceSide = 'N';
    draft.doors.push({ room: 0, to: -1, kind: 'entrance' });
    return { floors: [draft], notes };
  }
  const double = B >= 7 - EPS;
  const north = [
    ...(p.rooms >= 2 ? [req('wardrobe', 'Гардероб', 3, 1.3, 3)] : []),
    ...(p.rooms >= 2 ? [req('wc', 'Санузел', 2, 1.1, 2)] : []),
    req('bath', p.rooms >= 2 ? 'Ванная' : 'Санузел', 4.5, 1.6),
  ];
  const south = bedroomReqs(p.rooms);
  if (chance(r, 0.5)) south.reverse();
  const bandDepth = double ? B - 2.6 - 1.2 : B - 1.2;
  const want = south.reduce((s, q) => s + Math.max(q.minW, q.target / Math.max(bandDepth, 1)), 0);
  const all = double ? want : want + minLen(north);
  const endW = snap(
    clamp(
      A - all,
      3,
      Math.max(
        3,
        A - (double ? Math.max(minLen(north), minLen(south)) : minLen([...north, ...south])),
      ),
    ),
  );
  const frame: CorridorFrame = {
    endW: Math.min(endW, A - 1),
    double,
    northDepth: snap(clamp(B * between(r, 0.36, 0.42), 2.2, 3.2)),
    cw: 1.2,
  };
  const draft = corridorFloor(
    A,
    B,
    req('living', 'Кухня-гостиная', 20, 3),
    north,
    south,
    frame,
    true,
    notes,
  );
  return { floors: [draft], notes };
}

function banyaPlans(A: number, B: number, r: Rand) {
  const steam = snap(clamp(A * between(r, 0.26, 0.3), 1.6, 2.4));
  const wash = snap(clamp(A * 0.22, 1.2, 2));
  const reqs: Req[] = [];
  const widths: number[] = [];
  const rest = A - steam - wash;
  if (A >= 5.4) {
    reqs.push(req('vestibule', 'Тамбур', 0, 1.2), req('rest', 'Комната отдыха', 0, 2));
    widths.push(1.3, rest - 1.3);
  } else if (rest >= 1.4) {
    reqs.push(req('rest', 'Предбанник, комната отдыха', 0, 1.4));
    widths.push(rest);
  }
  reqs.push(
    req('wash', reqs.length ? 'Мойка' : 'Предбанник-мойка', 0, 1.2),
    req('steam', 'Парная', 0, 1.6),
  );
  widths.push(reqs.length === 2 ? A - steam : wash, steam);
  const draft = rowFloor(A, B, reqs, widths);
  return { floors: [draft], notes: [] as string[] };
}

function garagePlans(p: DesignParams, A: number, B: number) {
  const notes: string[] = [];
  const cars = p.rooms;
  // A car parks across the garage from 5.2 m of clear depth.
  const across = B >= 5.2 - EPS;
  let boxW = across ? Math.max(3.4 * cars, 4) : 6.2;
  if (!across && cars > 1) notes.push('Ширина меньше 6 м: машины встают друг за другом');
  if (!across) boxW = Math.max(boxW, Math.min(A, 6.2 * cars));
  boxW = Math.min(A, snap(boxW));
  let rest = A - boxW;
  let floors = p.floors;
  const stairW = 1.4;
  if (floors > 1 && rest < stairW + EPS) {
    floors = 1;
    notes.push('Для лестницы на второй этаж не хватило длины — один этаж');
  }
  const reqs1: Req[] = [req('garage', cars > 1 ? `Гараж на ${cars} машины` : 'Гараж', 0, 3)];
  const widths1 = [boxW];
  if (floors > 1) {
    reqs1.push(req('stair', 'Лестница', 0, stairW));
    widths1.push(stairW);
    rest -= stairW;
  }
  if (rest >= 2.4 - EPS) {
    const shop = rest >= 4 ? snap(rest - 1.6) : rest;
    reqs1.push(req('workshop', 'Мастерская', 0, 2));
    widths1.push(shop);
    if (rest - shop >= 1.2 - EPS) {
      reqs1.push(req('storage', 'Кладовая', 0, 1.2));
      widths1.push(rest - shop);
    }
  } else if (rest >= 1 - EPS) {
    reqs1.push(req('storage', 'Кладовая', 0, 1));
    widths1.push(rest);
  } else {
    // A strip too narrow for a room goes to the garage box.
    boxW += rest;
    widths1[0] = boxW;
  }
  const f1 = rowFloor(A, B, reqs1, widths1);
  f1.notes = notes;
  const plans = [f1];
  if (floors > 1) {
    const r2 = A - boxW - stairW;
    const reqs2: Req[] = [req('studio', 'Студия', 0, 3), req('stair', 'Лестница', 0, stairW)];
    const widths2 = [boxW, stairW];
    if (r2 >= 1.2 - EPS) {
      if (r2 >= 2.8) {
        reqs2.push(req('wc', 'Санузел', 0, 1.2), req('storage', 'Кладовая', 0, 1.2));
        widths2.push(1.5, r2 - 1.5);
      } else {
        reqs2.push(req('wc', 'Санузел', 0, 1.2));
        widths2.push(r2);
      }
    } else widths2[1]! += r2;
    const f2 = rowFloor(A, B, reqs2, widths2);
    f2.entrance = -1;
    plans.push(f2);
  }
  return { floors: plans, notes, across, cars };
}

// ---------------------------------------------------------------------------
// From drafts to drawn floors.

/** Shared edge of two cells, or null. */
export function sharedEdge(a: Rect, b: Rect): Segment | null {
  const ox0 = Math.max(a.x, b.x);
  const ox1 = Math.min(a.x + a.w, b.x + b.w);
  const oy0 = Math.max(a.y, b.y);
  const oy1 = Math.min(a.y + a.h, b.y + b.h);
  if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) {
    const x = Math.abs(a.x + a.w - b.x) < EPS ? b.x : a.x;
    return oy1 - oy0 > EPS ? { x1: x, y1: oy0, x2: x, y2: oy1 } : null;
  }
  if (Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS) {
    const y = Math.abs(a.y + a.h - b.y) < EPS ? b.y : a.y;
    return ox1 - ox0 > EPS ? { x1: ox0, y1: y, x2: ox1, y2: y } : null;
  }
  return null;
}

const DOOR_W: Partial<Record<RoomKind, number>> = {
  wc: 0.7,
  bath: 0.7,
  steam: 0.7,
  wash: 0.7,
  storage: 0.7,
};

interface BuildCtx {
  A: number;
  B: number;
  ext: number;
  part: number;
  mirror: boolean;
  object: DesignParams['object'];
  style: DesignParams['style'];
  rand: Rand;
  garage?: { across: boolean; cars: number };
}

function buildFloor(draft: FloorDraft, index: number, label: string, ctx: BuildCtx): FloorPlan {
  const { A, B, ext, part, mirror } = ctx;
  // Inner → outer coordinates, with the mirror.
  const cells = draft.cells.map((c) => {
    const x = mirror ? ext + A - c.rect.x - c.rect.w : ext + c.rect.x;
    return { req: c.req, rect: { x, y: ext + c.rect.y, w: c.rect.w, h: c.rect.h } };
  });
  const inner = { x0: ext, y0: ext, x1: ext + A, y1: ext + B };
  const rooms: Room[] = cells.map((c, i) => {
    const { x, y, w, h } = c.rect;
    const l = Math.abs(x - inner.x0) < EPS ? 0 : part / 2;
    const rr = Math.abs(x + w - inner.x1) < EPS ? 0 : part / 2;
    const t = Math.abs(y - inner.y0) < EPS ? 0 : part / 2;
    const b = Math.abs(y + h - inner.y1) < EPS ? 0 : part / 2;
    const clear = { x: x + l, y: y + t, w: w - l - rr, h: h - t - b };
    const zones = (draft.zones.get(i) ?? []).map((z) => ({
      name: z.name,
      rect: {
        x: mirror ? ext + A - z.rect.x - z.rect.w : ext + z.rect.x,
        y: ext + z.rect.y,
        w: z.rect.w,
        h: z.rect.h,
      },
    }));
    return {
      id: `f${index}r${i}`,
      kind: c.req.kind,
      name: c.req.name,
      cell: c.rect,
      clear,
      area: round(clear.w * clear.h, 1),
      wet: WET_KINDS.includes(c.req.kind),
      zones,
    };
  });
  // Partitions, each shared edge once.
  const partitions: Segment[] = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const e = sharedEdge(cells[i]!.rect, cells[j]!.rect);
      if (e) partitions.push(e);
    }
  }
  const doors: Door[] = [];
  const lastSide = new Map<string, boolean>();
  const r = ctx.rand;
  for (const plan of draft.doors) {
    const room = rooms[plan.room]!;
    const kind = room.kind;
    if (plan.to < 0) {
      // Outside: entrance or garage gates.
      const c = room.cell;
      if (ctx.object === 'garage' && kind === 'garage' && ctx.garage) {
        const { across, cars } = ctx.garage;
        if (across) {
          const n = Math.max(1, Math.min(cars, Math.floor(c.w / 2.9)));
          const gw = Math.min(2.6, c.w / n - 0.5);
          for (let g = 0; g < n; g++) {
            doors.push({
              x: c.x + (c.w * (g + 0.5)) / n,
              y: ext + B + ext / 2,
              axis: 'x',
              width: round(gw, 2),
              swing: -1,
              hingeLow: true,
              kind: 'gate',
              rooms: [room.id, null],
            });
          }
        } else {
          const wallX = mirror ? ext + A + ext / 2 : ext / 2;
          doors.push({
            x: wallX,
            y: ext + B / 2,
            axis: 'y',
            width: round(Math.min(2.6, B - 0.4), 2),
            swing: mirror ? -1 : 1,
            hingeLow: true,
            kind: 'gate',
            rooms: [room.id, null],
          });
        }
        continue;
      }
      if (draft.entranceSide === 'N') {
        const dx = mirror ? c.x + c.w - 0.9 : c.x + 0.9;
        doors.push({
          x: dx,
          y: ext / 2,
          axis: 'x',
          width: 0.9,
          swing: 1,
          hingeLow: !mirror,
          kind: 'entrance',
          rooms: [room.id, null],
        });
        continue;
      }
      const wallX = mirror ? ext + A + ext / 2 : ext / 2;
      doors.push({
        x: wallX,
        y: c.y + c.h / 2,
        axis: 'y',
        width: 0.9,
        // Drawn opening inwards, so the leaf stays clear of the dimension lines.
        swing: mirror ? -1 : 1,
        hingeLow: chance(r, 0.5),
        kind: 'entrance',
        rooms: [room.id, null],
      });
      continue;
    }
    const other = rooms[plan.to]!;
    const e = sharedEdge(room.cell, other.cell);
    if (!e) continue;
    const axis: Axis = e.y1 === e.y2 ? 'x' : 'y';
    const lo = axis === 'x' ? e.x1 : e.y1;
    const hi = axis === 'x' ? e.x2 : e.y2;
    const len = hi - lo;
    const width =
      plan.kind === 'opening'
        ? round(Math.min(1.2, len - 0.3), 2)
        : Math.min(DOOR_W[kind] ?? DOOR_W[other.kind] ?? 0.8, len - 0.3);
    const margin = 0.2 + width / 2 + part / 2;
    // Two doors of one room go to opposite ends, so their leaves never clash.
    const prev =
      lastSide.get(room.id) ?? (other.kind === 'hall' ? undefined : lastSide.get(other.id));
    const nearLow = prev === undefined ? chance(r, 0.5) : !prev;
    lastSide.set(room.id, nearLow);
    if (other.kind !== 'hall') lastSide.set(other.id, nearLow);
    const pos = len < 2 * margin + 0.2 ? (lo + hi) / 2 : nearLow ? lo + margin : hi - margin;
    // The leaf swings into the room; wet rooms open outwards.
    const roomSide =
      axis === 'x'
        ? room.cell.y + room.cell.h / 2 > e.y1
          ? 1
          : -1
        : room.cell.x + room.cell.w / 2 > e.x1
          ? 1
          : -1;
    const swing = (room.wet ? -roomSide : roomSide) as 1 | -1;
    doors.push({
      x: axis === 'x' ? pos : e.x1,
      y: axis === 'x' ? e.y1 : pos,
      axis,
      width: round(width, 2),
      swing,
      hingeLow: len < 2 * margin + 0.2 ? true : nearLow,
      kind: plan.kind,
      rooms: [room.id, other.id],
    });
  }
  const windows = placeWindows(rooms, doors, ctx, draft.entrance >= 0);
  return { index, label, rooms, doors, windows, partitions };
}

const WINDOW_RULE: Partial<Record<RoomKind, 'main' | 'room' | 'small' | 'stair' | 'shop'>> = {
  living: 'main',
  studio: 'main',
  bedroom: 'room',
  kids: 'room',
  cabinet: 'room',
  rest: 'room',
  bath: 'small',
  wc: 'small',
  wash: 'small',
  steam: 'small',
  boiler: 'small',
  stair: 'stair',
  workshop: 'shop',
};

function placeWindows(rooms: Room[], doors: Door[], ctx: BuildCtx, hasEntrance: boolean): Win[] {
  const { A, B, ext, object, style } = ctx;
  const st = STYLES[style];
  const wins: Win[] = [];
  const inner = { x0: ext, y0: ext, x1: ext + A, y1: ext + B };
  for (const room of rooms) {
    let rule = WINDOW_RULE[room.kind];
    // A first-floor-less corridor end gets a window (the second floor hall).
    if (room.kind === 'hall' && !hasEntrance) rule = 'stair';
    if (!rule) continue;
    if (object === 'flat' && (room.kind === 'wc' || room.kind === 'bath')) continue;
    const c = room.cell;
    const edges: { axis: Axis; at: number; lo: number; hi: number; side: 'N' | 'S' | 'W' | 'E' }[] =
      [];
    if (Math.abs(c.y - inner.y0) < EPS)
      edges.push({ axis: 'x', at: ext / 2, lo: c.x, hi: c.x + c.w, side: 'N' });
    if (Math.abs(c.y + c.h - inner.y1) < EPS)
      edges.push({ axis: 'x', at: inner.y1 + ext / 2, lo: c.x, hi: c.x + c.w, side: 'S' });
    if (object !== 'flat') {
      if (Math.abs(c.x - inner.x0) < EPS)
        edges.push({ axis: 'y', at: ext / 2, lo: c.y, hi: c.y + c.h, side: 'W' });
      if (Math.abs(c.x + c.w - inner.x1) < EPS)
        edges.push({ axis: 'y', at: inner.x1 + ext / 2, lo: c.y, hi: c.y + c.h, side: 'E' });
    }
    // South first: daylight for living rooms.
    const order = { S: 0, W: 1, E: 2, N: 3 };
    edges.sort((a, b) => order[a.side] - order[b.side]);
    const outer = doors.filter((d) => d.rooms[0] === room.id && d.rooms[1] === null);
    const single = rule === 'small' || rule === 'stair' || rule === 'shop';
    let placed = 0;
    for (const e of edges) {
      if (single && placed) break;
      if (
        outer.some((d) => d.axis === e.axis && Math.abs((e.axis === 'x' ? d.y : d.x) - e.at) < 0.5)
      )
        continue;
      const len = e.hi - e.lo;
      let w =
        rule === 'main'
          ? st.window.width
          : rule === 'room'
            ? Math.min(st.window.width, 1.5)
            : rule === 'small'
              ? room.kind === 'steam'
                ? 0.5
                : 0.6
              : rule === 'stair'
                ? 0.9
                : 1.2;
      const h =
        rule === 'main' || rule === 'room' ? st.window.height : rule === 'small' ? 0.6 : 1.2;
      let n = single ? 1 : Math.max(1, Math.floor((len - 0.4) / (w + 1.4)));
      // Rooms get windows on the two best walls at most.
      if (!single && placed >= 2) break;
      if (!single && e.side === 'N' && placed > 0 && rule === 'room') continue;
      while (n > 0 && n * w + (n + 1) * 0.5 > len) n -= 1;
      if (n === 0) {
        w = round(len - 1, 1);
        if (w < 0.5) continue;
        n = 1;
      }
      for (let k = 0; k < n; k++) {
        const pos = e.lo + (len * (k + 0.5)) / n;
        wins.push({
          x: e.axis === 'x' ? pos : e.at,
          y: e.axis === 'x' ? e.at : pos,
          axis: e.axis,
          width: round(w, 2),
          height: h,
          room: room.id,
        });
      }
      placed += 1;
    }
  }
  return wins;
}

function roofFor(p: DesignParams): Roof {
  if (p.object === 'banya') return p.width <= 3 ? 'barrel' : 'gable';
  const roof = STYLES[p.style].roof;
  if (p.object === 'garage' && roof === 'hip') return 'gable';
  return roof;
}

/** The whole building: floors, walls, roof. Pure: same params and seed → same plan. */
export function buildBuilding(p: DesignParams, rand: Rand): Building {
  const spec = OBJECT_SPECS[p.object];
  const { ext, part } = spec;
  const A = round(p.length - 2 * ext, 2);
  const B = round(p.width - 2 * ext, 2);
  const mirror = chance(rand, 0.5);
  let result: { floors: FloorDraft[]; notes: string[]; across?: boolean; cars?: number };
  if (p.object === 'house') result = housePlans(p, A, B, rand);
  else if (p.object === 'flat') result = flatPlans(p, A, B, rand);
  else if (p.object === 'banya') {
    result = banyaPlans(A, B, rand);
  } else result = garagePlans(p, A, B);
  const ctx: BuildCtx = {
    A,
    B,
    ext,
    part,
    mirror,
    object: p.object,
    style: p.style,
    rand,
    garage:
      p.object === 'garage' ? { across: result.across ?? true, cars: result.cars ?? 1 } : undefined,
  };
  if (p.object === 'banya' || p.object === 'garage') {
    const f = result.floors[0]!;
    f.doors.push({ room: 0, to: -1, kind: 'entrance' });
  }
  const many = result.floors.length > 1;
  const floors = result.floors.map((d, i) =>
    buildFloor(d, i, many ? `План ${i + 1} этажа` : 'План', ctx),
  );
  const notes = [...result.notes, ...result.floors.flatMap((f) => f.notes)];
  return {
    L: p.length,
    W: p.width,
    ext,
    part,
    ceiling: spec.ceiling,
    roof: roofFor(p),
    floors,
    notes: [...new Set(notes)],
  };
}
