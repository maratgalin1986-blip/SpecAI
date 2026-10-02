import { between, chance, round, type Rand } from '@/lib/design/random';
import type {
  Budget,
  DesignParams,
  LandZone,
  LandZoneKind,
  Landscape,
  Rect,
} from '@/lib/design/types';

// Zoning plan of a plot. The street is at the bottom (y = L). Front: the
// parking pad and the driveway at the gate, the wicket and the path to the
// entrance, a flower bed. The house keeps 5+ m from the street and 3+ m from
// the neighbours (СП 53.13330 / СП 30-102). Back, beyond the terrace: a
// central path, the vegetable beds and the barbecue on one side, the
// playground (seen from the terrace) and the fruit garden on the other.
// The lawn is whatever is left.

const snap = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const ZONE_NAMES: Record<LandZoneKind, string> = {
  house: 'Дом',
  terrace: 'Терраса',
  driveway: 'Въезд',
  parking: 'Парковка на 2 машины',
  path: 'Дорожки',
  beds: 'Огород, грядки',
  playground: 'Детская площадка',
  bbq: 'Зона барбекю',
  flowers: 'Цветник',
  garden: 'Сад (газон и плодовые деревья)',
  lawn: 'Газон',
};

export function buildLandscape(p: DesignParams, r: Rand): Landscape {
  const W = p.width;
  const L = p.length;
  const zones: LandZone[] = [];
  const add = (kind: LandZoneKind, rect: Rect, name = ZONE_NAMES[kind]) => {
    if (rect.w <= 0.2 || rect.h <= 0.2) return;
    zones.push({ kind, name, rect, area: round(rect.w * rect.h, 1) });
  };
  const notes: string[] = [];
  // Front: parking pad and driveway at the street, on the left (mirrored later).
  const padW = 6;
  const padD = 5.5;
  const driveD = snap(clamp(L * 0.08, 2, 4));
  const driveW = 3.5;
  const padX = 0.5;
  add('driveway', { x: padX + (padW - driveW) / 2, y: L - driveD, w: driveW, h: driveD });
  add('parking', { x: padX, y: L - driveD - padD, w: padW, h: padD });
  // The house.
  const hX = snap(clamp(W - 10.5, 5.5, 12));
  const front = snap(between(r, 6, 8));
  const hY = snap(clamp(Math.min(10, (L - front - 4) * 0.6), 5, 10));
  const minX = padX + padW + 1;
  const maxX = W - 3 - hX;
  const hx = snap(minX + (maxX - minX) * between(r, 0.2, 0.8));
  const hB = L - front;
  const hT = hB - hY;
  add('house', { x: hx, y: hT, w: hX, h: hY });
  // Terrace behind the house.
  let backEdge = hT;
  if (hT >= 4.5) {
    const tW = Math.min(hX, snap(between(r, 4, 6.5)));
    const tx = snap(hx + (hX - tW) * between(r, 0, 1));
    add('terrace', { x: tx, y: hT - 3, w: tW, h: 3 });
    backEdge = hT - 3;
  } else notes.push('Участок неглубокий: терраса — сбоку от дома или над входом');
  // Wicket and the path to the entrance.
  const wx = padX + padW + 0.3;
  const ex = hx + hX / 2;
  add('path', { x: wx, y: hB + 1.2, w: 1.2, h: L - hB - 1.2 });
  add('path', { x: wx, y: hB, w: Math.max(1.2, ex + 0.6 - wx), h: 1.2 });
  // Flower bed on the street side of the house, right of the entrance.
  const fx = ex + 1.2;
  const fw = Math.min(4, hx + hX - fx);
  if (fw >= 1.5 && L - hB >= 4.5) add('flowers', { x: fx, y: hB + 2, w: fw, h: 1.2 });
  // Back.
  const terrace = zones.find((z) => z.kind === 'terrace');
  const px = snap((terrace ? terrace.rect.x + terrace.rect.w / 2 : ex) - 0.6);
  const backBottom = backEdge - 1.5;
  const D = backBottom - 1;
  const beds: Rect[] = [];
  const trees: { x: number; y: number }[] = [];
  if (D >= 5) {
    add('path', { x: px, y: 1.5, w: 1.2, h: backEdge - 1.5 });
    const left: Rect = { x: 1, y: 1, w: px - 0.5 - 1, h: D };
    const right: Rect = { x: px + 1.7, y: 1, w: W - 1 - (px + 1.7), h: D };
    const bedsLeft = chance(r, 0.5);
    const sideA = bedsLeft ? left : right;
    const sideB = bedsLeft ? right : left;
    const nearPathA = bedsLeft ? sideA.x + sideA.w : sideA.x;
    const nearPathB = bedsLeft ? sideB.x : sideB.x + sideB.w;
    if (sideA.w >= 3) {
      const withBbq = D >= 11 && sideA.w >= 4.5;
      const bedsD = snap(Math.min(D - (withBbq ? 5.5 : 0), clamp(D * 0.55, 4, 12)));
      const bedsW = Math.min(sideA.w, 12);
      const bx = bedsLeft ? sideA.x : sideA.x + sideA.w - bedsW;
      add('beds', { x: bx, y: 1, w: bedsW, h: bedsD });
      const n = Math.max(1, Math.floor((bedsW - 0.4 + 0.6) / 1.6));
      for (let i = 0; i < n; i++) {
        beds.push({ x: bx + 0.4 + i * 1.6, y: 1.5, w: 1, h: bedsD - 1 });
      }
      if (withBbq) {
        const bbqX = bedsLeft ? nearPathA - 4 : nearPathA;
        add('bbq', { x: bbqX, y: backBottom - 4, w: 4, h: 4 });
      }
    }
    if (sideB.w >= 3) {
      const pgW = Math.min(6, sideB.w);
      const pgD = snap(Math.min(5, D * 0.45));
      const pgX = bedsLeft ? nearPathB : nearPathB - pgW;
      add('playground', { x: pgX, y: backBottom - pgD, w: pgW, h: pgD });
      const gH = backBottom - pgD - 1 - 1;
      if (gH >= 3) {
        add('garden', { x: sideB.x, y: 1, w: sideB.w, h: gH });
        for (let ty = 3; ty <= 1 + gH - 1.5; ty += 4) {
          for (let tx = sideB.x + 2; tx <= sideB.x + sideB.w - 1.5; tx += 4) {
            trees.push({ x: tx, y: ty });
          }
        }
      }
    }
  } else notes.push('Мало места за домом: огород и площадку лучше разместить сбоку');
  const used = zones.reduce((s, z) => s + z.area, 0);
  const garden = zones.filter((z) => z.kind === 'garden').reduce((s, z) => s + z.area, 0);
  const openLawn = round(W * L - used, 1);
  // Mirror: the drive on the right for half the seeds.
  const mirror = chance(r, 0.5);
  const mx = (x: number, w = 0) => (mirror ? W - x - w : x);
  for (const z of zones) z.rect = { ...z.rect, x: mx(z.rect.x, z.rect.w) };
  const bedRects = beds.map((b) => ({ ...b, x: mx(b.x, b.w) }));
  const treePts = trees.map((t) => ({ x: mx(t.x), y: t.y }));
  notes.push(
    'Дом — не ближе 5 м от красной линии улицы и 3 м от границы соседнего участка',
    'Баня и хозпостройки — не ближе 1 м от соседа, деревья среднего роста — 2 м',
  );
  return {
    W,
    L,
    zones,
    trees: treePts,
    beds: bedRects,
    gate: { x: mx(padX + padW / 2), width: driveW },
    wicket: { x: mx(wx + 0.6), width: 1.2 },
    lawn: round(openLawn + garden, 1),
    openLawn,
    notes,
  };
}

export interface LandQty {
  name: string;
  value: number;
  unit: string;
}

/** Paving, base layers, lawn, soil and earthworks of a zoning plan. */
export function landscapeQuantities(l: Landscape, budget: Budget): LandQty[] {
  const area = (kind: LandZoneKind) =>
    round(
      l.zones.filter((z) => z.kind === kind).reduce((s, z) => s + z.area, 0),
      1,
    );
  const paths = area('path') + area('bbq');
  const drive = area('driveway') + area('parking');
  const terrace = area('terrace');
  const lawn = l.lawn;
  const bedArea = round(
    l.beds.reduce((s, b) => s + b.w * b.h, 0),
    1,
  );
  const dig = round(paths * 0.3 + drive * 0.45 + terrace * 0.2, 1);
  const curb = round(
    l.zones
      .filter((z) => z.kind === 'path')
      .reduce((s, z) => s + 2 * Math.max(z.rect.w, z.rect.h), 0) +
      l.zones
        .filter((z) => z.kind === 'driveway' || z.kind === 'parking')
        .reduce((s, z) => s + 2 * (z.rect.w + z.rect.h), 0),
    0,
  );
  const tile =
    budget === 'econom'
      ? 'Тротуарная плитка 6 см'
      : budget === 'mid'
        ? 'Брусчатка 6 см'
        : 'Клинкерная брусчатка / камень';
  const driveTile =
    budget === 'econom'
      ? 'Щебень фр. 20–40 с геотканью'
      : budget === 'mid'
        ? 'Тротуарная плитка 8 см'
        : 'Брусчатка 8 см';
  const deck =
    budget === 'econom'
      ? 'Доска сосна, антисептик'
      : budget === 'mid'
        ? 'Террасная доска ДПК'
        : 'Лиственница, масло';
  return [
    { name: `Дорожки и барбекю: ${tile}`, value: paths, unit: 'м²' },
    { name: `Въезд и парковка: ${driveTile}`, value: drive, unit: 'м²' },
    { name: `Терраса: ${deck}`, value: terrace, unit: 'м²' },
    { name: 'Газон (посевной), включая сад', value: lawn, unit: 'м²' },
    { name: 'Семена газона, 40 г/м²', value: round(lawn * 0.04, 1), unit: 'кг' },
    { name: 'Плодородный грунт под газон, 10 см', value: round(lawn * 0.1, 1), unit: 'м³' },
    {
      name: `Грядки: ${l.beds.length} шт., грунт 25 см`,
      value: round(bedArea * 0.25, 1),
      unit: 'м³',
    },
    {
      name: 'Песок под мощение, 10–15 см',
      value: round(paths * 0.1 + drive * 0.15, 1),
      unit: 'м³',
    },
    {
      name: 'Щебень фр. 20–40, 15–25 см',
      value: round(paths * 0.15 + drive * 0.25, 1),
      unit: 'м³',
    },
    { name: 'Бордюр садовый', value: curb, unit: 'п. м' },
    { name: 'Плодовые деревья', value: l.trees.length, unit: 'шт.' },
    { name: 'Выемка грунта под мощение и террасу', value: dig, unit: 'м³' },
    {
      name: 'Вывоз грунта самосвалом (10 м³, разрыхление 1,2)',
      value: Math.ceil((dig * 1.2) / 10),
      unit: 'рейс.',
    },
    { name: 'Забор по периметру', value: round(2 * (l.W + l.L), 0), unit: 'п. м' },
  ];
}
