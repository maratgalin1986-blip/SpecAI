import { round } from '@/lib/design/random';
import { finishFor, type Finish } from '@/lib/design/styles';
import type { Budget, Building, DesignStyle, Door, RoomKind, Win } from '@/lib/design/types';

// The «ведомость» of a design project: rooms with areas, finishing areas
// (floor, walls minus openings, ceiling) and openings, then the materials
// summed by name with a cutting reserve.

/** Height of a door opening, m. */
export const DOOR_H = 2.1;
export const GATE_H = 2.3;

export const openingArea = (d: Pick<Door, 'width' | 'kind'>) =>
  d.width * (d.kind === 'gate' ? GATE_H : DOOR_H);

export const windowArea = (w: Pick<Win, 'width' | 'height'>) => w.width * w.height;

/** Wall finishing area: perimeter × height minus openings, never below zero. */
export function wallFinishArea(perimeter: number, height: number, openings: number): number {
  return Math.max(0, round(perimeter * height - openings, 1));
}

export interface SpecRow {
  id: string;
  floor: number;
  name: string;
  kind: RoomKind;
  area: number;
  perimeter: number;
  walls: number;
  ceiling: number;
  doors: number;
  windows: number;
  finish: Finish;
}

export interface MaterialLine {
  surface: 'Пол' | 'Стены' | 'Потолок';
  name: string;
  area: number;
  /** Area with the cutting reserve, rounded up. */
  order: number;
}

export interface Spec {
  rows: SpecRow[];
  totals: {
    area: number;
    living: number;
    walls: number;
    ceiling: number;
    doors: number;
    windows: number;
    openings: number;
  };
  materials: MaterialLine[];
}

const LIVING: RoomKind[] = ['living', 'bedroom', 'kids', 'cabinet', 'studio', 'rest'];

/** Cutting reserve by surface: floors 10 %, tiles 12 %, paint and ceilings 5 %. */
export function reserveFor(surface: MaterialLine['surface'], name: string): number {
  if (/плитк|керамогранит/i.test(name)) return 0.12;
  if (surface === 'Пол') return 0.1;
  return 0.05;
}

export function buildSpec(b: Building, style: DesignStyle, budget: Budget): Spec {
  const rows: SpecRow[] = [];
  for (const floor of b.floors) {
    for (const room of floor.rooms) {
      const doors = floor.doors.filter((d) => d.rooms.includes(room.id));
      const wins = floor.windows.filter((w) => w.room === room.id);
      const perimeter = round(2 * (room.clear.w + room.clear.h), 2);
      const openings =
        doors.reduce((s, d) => s + openingArea(d), 0) + wins.reduce((s, w) => s + windowArea(w), 0);
      rows.push({
        id: room.id,
        floor: floor.index,
        name: room.name,
        kind: room.kind,
        area: room.area,
        perimeter,
        walls: wallFinishArea(perimeter, b.ceiling, openings),
        ceiling: room.area,
        doors: doors.length,
        windows: wins.length,
        finish: finishFor(room.kind, style, budget),
      });
    }
  }
  const sum = (pick: (r: SpecRow) => number) =>
    round(
      rows.reduce((s, r) => s + pick(r), 0),
      1,
    );
  const doors = b.floors.reduce((s, f) => s + f.doors.length, 0);
  const windows = b.floors.reduce((s, f) => s + f.windows.length, 0);
  const lines = new Map<string, MaterialLine>();
  const add = (surface: MaterialLine['surface'], name: string, area: number) => {
    const key = `${surface}|${name}`;
    const line = lines.get(key) ?? { surface, name, area: 0, order: 0 };
    line.area = round(line.area + area, 1);
    line.order = Math.ceil(line.area * (1 + reserveFor(surface, name)));
    lines.set(key, line);
  };
  for (const r of rows) {
    add('Пол', r.finish.floor, r.area);
    add('Стены', r.finish.walls, r.walls);
    add('Потолок', r.finish.ceiling, r.ceiling);
  }
  return {
    rows,
    totals: {
      area: sum((r) => r.area),
      living: round(
        rows.filter((r) => LIVING.includes(r.kind)).reduce((s, r) => s + r.area, 0),
        1,
      ),
      walls: sum((r) => r.walls),
      ceiling: sum((r) => r.ceiling),
      doors,
      windows,
      openings: doors + windows,
    },
    materials: [...lines.values()],
  };
}
