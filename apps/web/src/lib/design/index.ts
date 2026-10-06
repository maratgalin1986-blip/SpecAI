import { buildingIso, landscapeIso, type IsoModel } from '@/lib/design/iso';
import { buildLandscape, landscapeQuantities, type LandQty } from '@/lib/design/landscape';
import { buildBuilding, OBJECT_SPECS } from '@/lib/design/layout';
import { rng, round } from '@/lib/design/random';
import { buildSpec, type Spec } from '@/lib/design/spec';
import {
  BUDGETS,
  finishFor,
  FURNITURE,
  lightingFor,
  paletteFor,
  STYLES,
  STYLE_IDS,
  type Finish,
  type StyleDef,
  type Swatch,
} from '@/lib/design/styles';
import type {
  Budget,
  Building,
  DesignObject,
  DesignParams,
  DesignStyle,
  Landscape,
  RoomKind,
} from '@/lib/design/types';

// One entry point: generateDesign(params, seed) → the whole sketch design
// project (plans, 3D lines, style board, «ведомость»). Pure and deterministic.

export const OBJECT_IDS = Object.keys(OBJECT_SPECS) as DesignObject[];
export const BUDGET_IDS = Object.keys(BUDGETS) as Budget[];

/** What a sketch design project consists of (and which sheets we draw). */
export const PROJECT_CONTENTS = [
  'Планировочное решение с расстановкой зон',
  'Обмерный план: стены, проёмы, размеры',
  'Объёмная схема (3D)',
  'Концепция стиля: палитра, материалы',
  'Ведомость отделки: пол, стены, потолок',
  'Ведомость помещений и проёмов',
  'Сценарии освещения и зонирование мебели',
];

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export function normalizeParams(p: Partial<DesignParams> = {}): DesignParams {
  const object: DesignObject = p.object && p.object in OBJECT_SPECS ? p.object : 'house';
  const spec = OBJECT_SPECS[object];
  let length = round(clamp(Number(p.length ?? spec.length[2]), spec.length[0], spec.length[1]), 1);
  let width = round(clamp(Number(p.width ?? spec.width[2]), spec.width[0], spec.width[1]), 1);
  // Buildings are laid out along the long side.
  if (object !== 'landscape' && width > length) {
    [length, width] = [
      clamp(width, spec.length[0], spec.length[1]),
      clamp(length, spec.width[0], spec.width[1]),
    ];
  }
  const style: DesignStyle = p.style && p.style in STYLES ? p.style : 'scandi';
  const budget: Budget = p.budget && p.budget in BUDGETS ? p.budget : 'mid';
  return {
    object,
    length,
    width,
    floors: Math.round(clamp(Number(p.floors ?? spec.floors[0]), spec.floors[0], spec.floors[1])),
    rooms: Math.round(clamp(Number(p.rooms ?? spec.rooms[2]), spec.rooms[0], spec.rooms[1])),
    style,
    budget,
  };
}

export interface RoomFinish {
  kind: RoomKind;
  name: string;
  finish: Finish;
  furniture: string;
}

export interface DesignProject {
  params: DesignParams;
  seed: number;
  title: string;
  /** Short project code for the title block, e.g. ДП-ДМ-10×8-108. */
  code: string;
  style: StyleDef;
  palette: Swatch[];
  building: Building | null;
  landscape: Landscape | null;
  spec: Spec | null;
  land: LandQty[] | null;
  iso: IsoModel;
  finishes: RoomFinish[];
  lighting: string[];
  notes: string[];
}

const CODES: Record<DesignObject, string> = {
  house: 'ДМ',
  banya: 'БН',
  garage: 'ГР',
  flat: 'КВ',
  landscape: 'ЛД',
};

const fmt = (n: number) => String(n).replace('.', ',');

export function designTitle(p: DesignParams): string {
  const size = `${fmt(p.length)}×${fmt(p.width)} м`;
  switch (p.object) {
    case 'house':
      return `Дом ${size}${p.floors > 1 ? ', 2 этажа' : ''}`;
    case 'banya':
      return p.width <= 3 ? `Баня-бочка ${fmt(p.length)} м` : `Баня ${size}`;
    case 'garage':
      return `Гараж ${size}${p.floors > 1 ? ' со студией' : ''}`;
    case 'flat':
      return p.rooms === 0 ? `Помещение ${size}` : `Квартира: ${p.rooms}-комн., ${size}`;
    case 'landscape':
      return `Участок ${fmt(round((p.length * p.width) / 100, 1))} сот. (${fmt(p.width)}×${fmt(p.length)} м)`;
  }
}

export function generateDesign(input: Partial<DesignParams>, seed: number): DesignProject {
  const params = normalizeParams(input);
  const rand = rng(seed * 7919 + OBJECT_IDS.indexOf(params.object) * 104729);
  const style = STYLES[params.style];
  const palette = paletteFor(params.style, Math.floor(rand() * 3));
  const lighting = lightingFor(params.style, params.budget);
  const title = designTitle(params);
  const code = `ДП-${CODES[params.object]}-${fmt(params.length)}×${fmt(params.width)}-${seed}`;
  if (params.object === 'landscape') {
    const landscape = buildLandscape(params, rand);
    return {
      params,
      seed,
      title,
      code,
      style,
      palette,
      building: null,
      landscape,
      spec: null,
      land: landscapeQuantities(landscape, params.budget),
      iso: landscapeIso(landscape),
      finishes: [],
      lighting: [
        'Подсветка дорожек низкими столбиками через 3–4 м, тёплый свет 2700 K.',
        'Прожектор на парковку с датчиком движения, гирлянды над зоной барбекю.',
        `${lighting[2]}`,
      ],
      notes: landscape.notes,
    };
  }
  const building = buildBuilding(params, rand);
  const spec = buildSpec(building, params.style, params.budget);
  const seen = new Set<RoomKind>();
  const finishes: RoomFinish[] = [];
  for (const f of building.floors) {
    for (const r of f.rooms) {
      if (seen.has(r.kind)) continue;
      seen.add(r.kind);
      finishes.push({
        kind: r.kind,
        name: r.name,
        finish: finishFor(r.kind, params.style, params.budget),
        furniture: FURNITURE[r.kind],
      });
    }
  }
  return {
    params,
    seed,
    title,
    code,
    style,
    palette,
    building,
    landscape: null,
    spec,
    land: null,
    iso: buildingIso(building),
    finishes,
    lighting,
    notes: building.notes,
  };
}

/** /smeta with the dimensions, when the estimate knows this kind of object. */
export function smetaHref(p: DesignParams, snab = false): string {
  const q = new URLSearchParams();
  if (snab) q.set('mode', 'snab');
  if (p.object === 'house' || p.object === 'banya' || p.object === 'garage') {
    q.set('object', p.object === 'house' ? 'house' : 'banya');
    q.set('length', String(p.length));
    q.set('width', String(p.width));
    q.set('floors', String(Math.max(1, p.floors)));
  } else if (p.object === 'landscape' && !snab) {
    q.set('job', 'planning');
  }
  const s = q.toString();
  return s ? `/smeta?${s}` : '/smeta';
}

/** Params and seed in the page query (?o=house&l=10&w=8&f=1&r=2&s=scandi&b=mid&seed=1). */
export function designQuery(p: DesignParams, seed: number): string {
  return new URLSearchParams({
    o: p.object,
    l: String(p.length),
    w: String(p.width),
    f: String(p.floors),
    r: String(p.rooms),
    s: p.style,
    b: p.budget,
    seed: String(seed),
  }).toString();
}

export function parseDesignQuery(
  q: Record<string, string | undefined>,
): { params: DesignParams; seed: number } | null {
  if (!q.o || !(q.o in OBJECT_SPECS)) return null;
  const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));
  const seed = Math.round(Number(q.seed));
  return {
    params: normalizeParams({
      object: q.o as DesignObject,
      length: num(q.l),
      width: num(q.w),
      floors: num(q.f),
      rooms: num(q.r),
      style: q.s as DesignStyle,
      budget: q.b as Budget,
    }),
    seed: Number.isFinite(seed) && seed > 0 ? seed : 1,
  };
}

/** Plain-text summary for WhatsApp and the consultation request. */
export function designSummary(d: DesignProject, brand: string, url?: string): string {
  const p = d.params;
  const lines = [
    `Дизайн-проект ${brand}: ${d.title}`,
    `Шифр: ${d.code}`,
    `Стиль: ${d.style.title}, бюджет: ${BUDGETS[p.budget].title.toLowerCase()}`,
  ];
  if (d.spec) {
    lines.push(
      `Площадь помещений: ${fmt(d.spec.totals.area)} м², окон ${d.spec.totals.windows}, дверей ${d.spec.totals.doors}`,
      `Помещения: ${d.spec.rows.map((r) => `${r.name} ${fmt(r.area)} м²`).join('; ')}`,
    );
  }
  if (d.landscape && d.land) {
    lines.push(
      `Зоны: ${d.landscape.zones
        .filter((z) => z.kind !== 'path')
        .map((z) => `${z.name} ${fmt(z.area)} м²`)
        .join('; ')}`,
      `Газон ${fmt(d.landscape.lawn)} м², выемка грунта ≈ ${fmt(d.land.find((q) => q.name.startsWith('Выемка'))?.value ?? 0)} м³`,
    );
  }
  lines.push(`Палитра: ${d.palette.map((s) => `${s.name} ${s.hex}`).join(', ')}`);
  const max = 990 - (url ? url.length + 1 : 0);
  const text = lines.join('\n');
  const body = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return url ? `${body}\n${url}` : body;
}

export { OBJECT_SPECS, STYLES, STYLE_IDS, BUDGETS };
