import type { MachineType } from '@/lib/machinePhotos';
import { billableHours, rateOf, RESERVE, type SmetaRow } from '@/lib/smeta';
import { MATERIALS, type Material } from '@/lib/smetaPrices';

// «Проект целиком»: a stage-by-stage plan of the whole construction the
// client described, with the СпецПласт16 machines each stage needs, hours
// from typical output norms and the owner's hourly rates (read from
// machineWorks via rateOf, never hard-coded). Everything is «примерно»: the
// dispatcher names the exact price. Pure functions, no I/O.

export type ObjectType = 'house' | 'banya' | 'warehouse' | 'site' | 'strip';
export type Foundation = 'strip' | 'slab' | 'piles';
export type Soil = 'sand' | 'loam' | 'clay';
export type StageId =
  | 'prep'
  | 'dig'
  | 'haul'
  | 'foundation'
  | 'base'
  | 'backfill'
  | 'walls'
  | 'roof'
  | 'facade'
  | 'landscape';

export interface ProjectInput {
  object: ObjectType;
  length: number;
  width: number;
  floors: number;
  foundation: Foundation;
  soil: Soil;
  haul: boolean;
  /** Distance to the dump, km. */
  distance: number;
}

export const OBJECTS: Record<
  ObjectType,
  {
    title: string;
    hint: string;
    maxFloors: number;
    foundation: Foundation;
    length: number;
    width: number;
  }
> = {
  house: {
    title: 'Частный дом',
    hint: 'Под ключ: от котлована до благоустройства',
    maxFloors: 3,
    foundation: 'strip',
    length: 10,
    width: 8,
  },
  banya: {
    title: 'Баня или гараж',
    hint: 'Небольшая постройка на участке',
    maxFloors: 2,
    foundation: 'strip',
    length: 6,
    width: 4,
  },
  warehouse: {
    title: 'Склад или ангар',
    hint: 'Каркас, сэндвич-панели',
    maxFloors: 1,
    foundation: 'slab',
    length: 30,
    width: 18,
  },
  site: {
    title: 'Площадка или дорога',
    hint: 'Корыто, песок, щебень, каток',
    maxFloors: 0,
    foundation: 'slab',
    length: 30,
    width: 6,
  },
  strip: {
    title: 'Ленточный фундамент',
    hint: 'Только фундамент под ваш проект',
    maxFloors: 0,
    foundation: 'strip',
    length: 10,
    width: 8,
  },
};

export const FOUNDATIONS: Record<Foundation, string> = {
  strip: 'Лента',
  slab: 'Плита',
  piles: 'Сваи',
};

/** Soil label and how fast it digs compared with loam. */
export const SOILS: Record<Soil, { title: string; dig: number }> = {
  sand: { title: 'Песок', dig: 1.15 },
  loam: { title: 'Суглинок', dig: 1 },
  clay: { title: 'Глина', dig: 0.75 },
};

export const STAGE_TITLES: Record<StageId, string> = {
  prep: 'Подготовка и планировка',
  dig: 'Котлован и траншеи',
  haul: 'Вывоз грунта',
  foundation: 'Фундамент',
  base: 'Основание: песок и щебень',
  backfill: 'Обратная засыпка',
  walls: 'Стены и каркас',
  roof: 'Кровля',
  facade: 'Фасад',
  landscape: 'Благоустройство',
};

/** Output norms used in the plan (typical, ordinary conditions). */
export const NORMS = {
  /** Backhoe on a pit / a trench in loam, m³/h; crawler excavator above 300 m³. */
  pitBackhoe: 20,
  trenchBackhoe: 18,
  pitExcavator: 45,
  bigDig: 300,
  /** Planning, m²/h: backhoe, or a dozer above 1500 m². */
  planBackhoe: 200,
  planDozer: 400,
  bigPlan: 1500,
  backfill: 40,
  spread: 40,
  /** Roller, m² per hour per layer. */
  roller: 500,
  /** Dump truck: m³ per trip, loading, average speed km/h. */
  truckM3: 10,
  truckLoadH: 0.5,
  truckKmh: 40,
  /** Delivery of sand or crushed stone from a quarry, h per trip. */
  supplyTripH: 1.5,
  swell: 1.25,
  /** Crane: setup per visit and per lift, h. */
  craneSetup: 1,
  craneLift: 0.2,
  kmuLift: 0.15,
  /** Rebar: a KMU trip carries up to 5 t, about 1.5 h in the city. */
  kmuTons: 5,
  kmuTripH: 1.5,
  /** Facade from the platform, m²/h; roof edge work, m/h. */
  facade: 15,
  roofEdge: 8,
  floorH: 3,
  hangarH: 6,
} as const;

/** Strip foundation geometry, m. */
export const STRIP = { trench: 0.8, depth: 1.5, band: 0.4, bandH: 1.8, cushion: 0.2 };
export const SLAB = { pit: 0.6, sand: 0.3, stone: 0.15, thick: 0.3 };
export const GRILLAGE = { width: 0.5, depth: 0.4 };
export const ROAD = { depth: 0.4, sand: 0.2, stone: 0.2 };
/** Rebar, kg per m³ of concrete. */
export const REBAR_KG = { strip: 80, slab: 100, piles: 60 };

export interface MaterialQty {
  material: Material;
  name: string;
  unit: string;
  qty: number;
}

export interface ProjectStage {
  id: StageId;
  title: string;
  rows: SmetaRow[];
  cost: number;
  /** Running total of the machinery up to and including this stage. */
  cumulative: number;
  hours: number;
  /** Calendar days, approximate, together with the builders' work. */
  days: number;
  materials: MaterialQty[];
  /** One line for the 3D caption: «котлован 72 м³». */
  metric: string;
}

export interface Project {
  input: ProjectInput;
  stages: ProjectStage[];
  total: number;
  totalHigh: number;
  days: number;
  machines: MachineType[];
  /** Rough material quantities (no prices: see the procurement estimate). */
  materials: MaterialQty[];
  /** Geometry for the drawing and the procurement list. */
  geo: {
    depth: number;
    height: number;
    digVolume: number;
    haulVolume: number;
    trips: number;
    concrete: number;
    stripLen: number;
  };
  notes: string[];
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => r1(n).toLocaleString('ru-RU');

/** Missing or out-of-range values take sensible defaults for the object. */
export function normalizeInput(input: Partial<ProjectInput> = {}): ProjectInput {
  const object: ObjectType = input.object && input.object in OBJECTS ? input.object : 'house';
  const spec = OBJECTS[object];
  const foundation: Foundation =
    object === 'site'
      ? 'slab'
      : object === 'strip'
        ? 'strip'
        : input.foundation && input.foundation in FOUNDATIONS
          ? input.foundation
          : spec.foundation;
  return {
    object,
    length: clamp(input.length ?? spec.length, 2, object === 'site' ? 500 : 120),
    width: clamp(input.width ?? spec.width, 2, object === 'site' ? 200 : 60),
    floors: spec.maxFloors ? Math.round(clamp(input.floors ?? 1, 1, spec.maxFloors)) : 0,
    foundation,
    soil: input.soil && input.soil in SOILS ? input.soil : 'loam',
    haul: input.haul ?? true,
    distance: clamp(input.distance ?? 10, 1, 80),
  };
}

const NAMES: Partial<Record<MachineType, string>> = {
  backhoe: 'Экскаватор-погрузчик',
  excavator: 'Гусеничный экскаватор',
  truck: 'Самосвал',
  dozer: 'Бульдозер',
  roller: 'Виброкаток',
  loader: 'Фронтальный погрузчик',
  crane: 'Автокран',
  kmu: 'Манипулятор КМУ 7 т',
  agp: 'Автовышка АГП',
};

export function machineRow(
  machine: MachineType,
  task: string,
  hours: number,
  rate = rateOf(machine),
): SmetaRow {
  const billed = billableHours(hours);
  return {
    machine,
    name: NAMES[machine] ?? machine,
    task,
    hours: billed,
    rate,
    sum: billed * rate,
  };
}

/** Days a set of rows keeps the site busy: machines of one stage work in turn. */
export const machineDays = (hours: number, parallel = 1) =>
  Math.max(1, Math.ceil(hours / parallel / 8 - 1e-9));

export function truckTripHours(distance: number) {
  return NORMS.truckLoadH + (2 * distance) / NORMS.truckKmh;
}

export function haulTrips(volumeInBank: number) {
  return volumeInBank > 0 ? Math.ceil((volumeInBank * NORMS.swell) / NORMS.truckM3 - 1e-9) : 0;
}

function planRow(area: number, soil: Soil, task: string) {
  const big = area > NORMS.bigPlan;
  const speed = (big ? NORMS.planDozer : NORMS.planBackhoe) * SOILS[soil].dig;
  return machineRow(big ? 'dozer' : 'backhoe', `${task} ${fmt(area)} м²`, area / speed);
}

function digRow(volume: number, soil: Soil, trench: boolean) {
  const big = volume > NORMS.bigDig;
  const speed =
    (big ? NORMS.pitExcavator : trench ? NORMS.trenchBackhoe : NORMS.pitBackhoe) * SOILS[soil].dig;
  return machineRow(big ? 'excavator' : 'backhoe', `копает ≈ ${fmt(volume)} м³`, volume / speed);
}

function supplyRow(volume: number, what: string) {
  const trips = Math.max(1, Math.ceil(volume / NORMS.truckM3 - 1e-9));
  return machineRow(
    'truck',
    `привозит ${what} ≈ ${fmt(volume)} м³, ${trips} рейс(ов)`,
    trips * NORMS.supplyTripH,
  );
}

function craneRow(lifts: number, visits: number, task: string) {
  return machineRow(
    'crane',
    `${task}: ${lifts} подъёмов`,
    visits * NORMS.craneSetup + lifts * NORMS.craneLift,
  );
}

interface Draft {
  id: StageId;
  rows: SmetaRow[];
  days: number;
  materials?: [Material, number][];
  metric: string;
}

const rowsHours = (rows: SmetaRow[], skip?: MachineType) =>
  rows.filter((r) => r.machine !== skip).reduce((h, r) => h + r.hours, 0);

/** The whole-project plan. `prices` is the material table (static by default). */
export function buildProject(raw: Partial<ProjectInput> = {}): Project {
  const input = normalizeInput(raw);
  const { object, length: L, width: W, floors, foundation, soil, haul, distance } = input;
  const perimeter = 2 * (L + W);
  const area = L * W;
  const drafts: Draft[] = [];
  const notes: string[] = [];
  const building = object === 'house' || object === 'banya' || object === 'warehouse';

  // 1. Preparation: plan the footprint with a 2 m margin.
  const prepArea = object === 'site' ? area : (L + 4) * (W + 4);
  const prep = [planRow(prepArea, soil, 'планирует')];
  drafts.push({
    id: 'prep',
    rows: prep,
    days: machineDays(rowsHours(prep)),
    metric: `площадка ${fmt(prepArea)} м²`,
  });

  // 2. Digging, by foundation.
  let digVolume = 0;
  let surplus = 0;
  let depth = 0;
  let concrete = 0;
  let stripLen = 0;
  if (object === 'site') {
    depth = ROAD.depth;
    digVolume = area * depth;
    surplus = digVolume;
  } else if (foundation === 'strip') {
    // Outer walls plus one bearing wall inside a house.
    stripLen = perimeter + (object === 'house' ? Math.max(L, W) : 0);
    depth = STRIP.depth;
    digVolume = stripLen * STRIP.trench * depth;
    concrete = stripLen * STRIP.band * STRIP.bandH;
    surplus = stripLen * (STRIP.band * depth + STRIP.trench * STRIP.cushion);
  } else if (foundation === 'slab') {
    depth = SLAB.pit;
    digVolume = (L + 1) * (W + 1) * depth;
    concrete = area * SLAB.thick;
    surplus = digVolume;
  } else {
    stripLen = perimeter + (object === 'house' ? Math.max(L, W) : 0);
    depth = GRILLAGE.depth;
    digVolume = stripLen * GRILLAGE.width * depth;
    concrete = stripLen * GRILLAGE.width * GRILLAGE.depth;
    surplus = concrete;
  }
  const trenchWork = object !== 'site' && foundation !== 'slab';
  const dig = [digRow(digVolume, soil, trenchWork)];
  drafts.push({
    id: 'dig',
    rows: dig,
    days: machineDays(rowsHours(dig)),
    metric: `${trenchWork ? 'траншеи' : object === 'site' ? 'корыто' : 'котлован'} ${fmt(digVolume)} м³, глубина ${fmt(depth)} м`,
  });

  // 3. Haul the surplus soil (trucks run in parallel when there are many trips).
  const trips = haul ? haulTrips(surplus) : 0;
  if (haul && trips > 0) {
    const tripH = truckTripHours(distance);
    const truck = machineRow(
      'truck',
      `вывоз ≈ ${fmt(surplus * NORMS.swell)} м³, ${trips} рейс(ов) по ${fmt(distance)} км`,
      trips * tripH,
    );
    const loader = machineRow(
      surplus > 100 ? 'loader' : 'backhoe',
      `грузит ${fmt(surplus)} м³`,
      surplus / (surplus > 100 ? 80 : NORMS.backfill),
    );
    const parallel = Math.min(3, Math.max(1, Math.ceil(trips / 8)));
    drafts.push({
      id: 'haul',
      rows: [loader, truck],
      days: machineDays(truck.hours, parallel),
      metric: `${trips} рейс(ов), ${fmt(surplus * NORMS.swell)} м³`,
    });
  } else {
    notes.push('Грунт оставляем на участке — разровняем при планировке.');
  }

  // 4. Foundation (concrete comes from the plant by mixer) or the road base.
  if (object === 'site') {
    const sand = area * ROAD.sand;
    const stone = area * ROAD.stone;
    const base = [
      supplyRow(sand + stone, 'песок и щебень'),
      machineRow(
        area > 600 ? 'loader' : 'backhoe',
        `разравнивает ${fmt(sand + stone)} м³`,
        (sand + stone) / NORMS.spread,
      ),
      machineRow('roller', `укатывает ${fmt(area)} м² × 2 слоя`, (area * 2) / NORMS.roller),
    ];
    drafts.push({
      id: 'base',
      rows: base,
      days: machineDays(rowsHours(base, 'truck')),
      materials: [
        ['sand', sand],
        ['stone', stone],
      ],
      metric: `песок ${fmt(sand)} м³ + щебень ${fmt(stone)} м³`,
    });
  } else {
    const rebar = (concrete * REBAR_KG[foundation]) / 1000;
    const rows = [
      machineRow(
        'kmu',
        `привозит и выгружает арматуру ≈ ${fmt(rebar)} т${foundation === 'piles' ? ' и сваи' : ''}`,
        Math.ceil(Math.max(rebar, 0.1) / NORMS.kmuTons) * NORMS.kmuTripH,
      ),
    ];
    const materials: [Material, number][] = [];
    if (foundation === 'strip') {
      const sand = stripLen * STRIP.trench * STRIP.cushion;
      rows.push(supplyRow(sand, 'песок'));
      materials.push(['sand', sand]);
    } else if (foundation === 'slab') {
      const sand = area * SLAB.sand;
      const stone = area * SLAB.stone;
      rows.push(supplyRow(sand + stone, 'песок и щебень'));
      rows.push(
        machineRow(
          'roller',
          `уплотняет подушку ${fmt(area)} м² × 2 слоя`,
          (area * 2) / NORMS.roller,
        ),
      );
      materials.push(['sand', sand], ['stone', stone]);
    } else {
      notes.push('Сваи погружает бригада: в смете только техника СпецПласт16.');
    }
    materials.push(['concrete', concrete], ['rebar', rebar]);
    const crew = foundation === 'piles' ? 4 : 5;
    drafts.push({
      id: 'foundation',
      rows,
      days: crew + 1,
      materials,
      metric: `${FOUNDATIONS[foundation].toLowerCase()}, бетон ${fmt(concrete)} м³`,
    });
    notes.push('Бетон привозит завод миксером; набор прочности — 7–28 дней до нагрузки.');
  }

  // 5. Backfill around a strip foundation.
  if (object !== 'site' && foundation === 'strip') {
    const volume = digVolume - surplus;
    const rows = [
      machineRow('backhoe', `засыпает ≈ ${fmt(volume)} м³`, volume / NORMS.backfill),
      machineRow(
        'roller',
        `уплотняет ${fmt(stripLen)} м по периметру`,
        (stripLen * 1.5 * 3) / NORMS.roller,
      ),
    ];
    drafts.push({
      id: 'backfill',
      rows,
      days: machineDays(rowsHours(rows)),
      metric: `засыпка ${fmt(volume)} м³`,
    });
  }

  // 6–8. The building itself.
  let height = 0;
  if (building) {
    if (object === 'warehouse') {
      height = NORMS.hangarH;
      const columns = Math.ceil(perimeter / 6);
      const trusses = Math.ceil(L / 6) + 1;
      const panels = Math.ceil(perimeter / 1.2 / 8);
      const lifts = columns + trusses + panels;
      const visits = Math.max(1, Math.ceil(lifts / 30));
      const walls = [craneRow(lifts, visits, 'колонны, фермы, панели')];
      drafts.push({ id: 'walls', rows: walls, days: 10, metric: `каркас, высота ${height} м` });
      const roofLifts = Math.ceil(area / (1.2 * 6 * 8)) + 2;
      const roof = [
        craneRow(roofLifts, 1, 'кровельные панели'),
        machineRow(
          'agp',
          `примыкания по периметру ${fmt(perimeter)} м`,
          perimeter / NORMS.roofEdge,
        ),
      ];
      drafts.push({ id: 'roof', rows: roof, days: 6, metric: `кровля ${fmt(area)} м²` });
    } else {
      height = floors * NORMS.floorH;
      const wallLifts = Math.ceil((perimeter * NORMS.floorH * 0.4) / 1.8);
      const slabLifts = Math.ceil(area / 7.2);
      const perFloor = wallLifts + slabLifts;
      const lifts = perFloor * floors;
      const walls =
        object === 'banya'
          ? [
              machineRow(
                'kmu',
                `${lifts} подъёмов блоков и плит, ${floors} эт.`,
                floors * NORMS.craneSetup + lifts * NORMS.kmuLift,
              ),
            ]
          : [craneRow(lifts, floors, `${floors} эт.: блоки и плиты`)];
      drafts.push({
        id: 'walls',
        rows: walls,
        days: floors * (object === 'banya' ? 5 : 7),
        metric: `${floors} эт., высота ${fmt(height)} м`,
      });
      const roofArea = area * 1.3;
      const roof =
        object === 'banya'
          ? [machineRow('agp', `кровля и свесы ${fmt(roofArea)} м²`, perimeter / NORMS.roofEdge)]
          : [
              craneRow(Math.ceil(roofArea / 15) + 2, 1, 'стропила и кровля'),
              machineRow(
                'agp',
                `свесы и водостоки ${fmt(perimeter)} м`,
                perimeter / NORMS.roofEdge,
              ),
            ];
      drafts.push({
        id: 'roof',
        rows: roof,
        days: object === 'banya' ? 4 : 7,
        metric: `кровля ≈ ${fmt(roofArea)} м²`,
      });
    }
    const facadeArea = perimeter * (height + 0.5);
    const facade = [machineRow('agp', `фасад ${fmt(facadeArea)} м²`, facadeArea / NORMS.facade)];
    drafts.push({
      id: 'facade',
      rows: facade,
      days: Math.max(2, Math.ceil(facadeArea / 40)),
      metric: `фасад ${fmt(facadeArea)} м²`,
    });
  }

  // 9. Landscaping: plan and roll a 5 m strip around, take the debris away.
  if (object !== 'strip') {
    const around = object === 'site' ? perimeter * 2 : (L + 10) * (W + 10) - area;
    const debris = object === 'site' ? 5 : Math.max(5, area * Math.max(1, floors) * 0.05);
    const rows = [
      planRow(around, soil, 'планирует вокруг'),
      machineRow('roller', `укатывает ${fmt(around)} м²`, around / NORMS.roller),
      machineRow(
        'truck',
        `вывоз мусора ≈ ${fmt(debris)} м³`,
        Math.ceil(debris / NORMS.truckM3) * truckTripHours(distance),
      ),
    ];
    drafts.push({
      id: 'landscape',
      rows,
      days: machineDays(rowsHours(rows, 'truck')) + 1,
      metric: `благоустройство ${fmt(around)} м²`,
    });
  }

  // Assemble: money, running totals, materials.
  let cumulative = 0;
  const stages: ProjectStage[] = drafts.map((d) => {
    const cost = d.rows.reduce((s, r) => s + r.sum, 0);
    cumulative += cost;
    const materials = (d.materials ?? [])
      .filter(([, q]) => q > 0)
      .map(([m, q]) => materialQty(m, q));
    return {
      id: d.id,
      title: STAGE_TITLES[d.id],
      rows: d.rows,
      cost,
      cumulative,
      hours: d.rows.reduce((h, r) => h + r.hours, 0),
      days: d.days,
      materials,
      metric: d.metric,
    };
  });
  const total = cumulative;
  const sums = new Map<Material, number>();
  for (const s of stages)
    for (const m of s.materials) sums.set(m.material, (sums.get(m.material) ?? 0) + m.qty);
  const materials = [...sums].map(([m, q]) => materialQty(m, q));
  const machines = [...new Set(stages.flatMap((s) => s.rows.map((r) => r.machine)))];
  notes.push(`Каждая машина — не меньше 4 ч за выезд. Сроки — ориентир вместе с работой бригады.`);
  return {
    input,
    stages,
    total,
    totalHigh: Math.round((total * RESERVE) / 100) * 100,
    days: stages.reduce((d, s) => d + s.days, 0),
    machines,
    materials,
    geo: {
      depth,
      height,
      digVolume: r1(digVolume),
      haulVolume: r1(surplus * NORMS.swell),
      trips,
      concrete: r1(concrete),
      stripLen,
    },
    notes,
  };
}

/** Rounds up to the step a supplier sells in. */
export function roundUp(qty: number, step: number): number {
  const q = Math.max(step, Math.ceil(qty / step - 1e-9) * step);
  return Math.round(q * 10) / 10;
}

/** Quantities without reserve, rounded the way suppliers sell them. */
export function materialQty(material: Material, qty: number): MaterialQty {
  const spec = MATERIALS[material];
  return { material, name: spec.name, unit: spec.unit, qty: roundUp(qty, spec.step) };
}

/** How many stages the partial (locked) version shows: about half, at least 2. */
export function visibleStageCount(project: Project): number {
  return Math.min(project.stages.length, Math.max(2, Math.floor(project.stages.length / 2)));
}

/** Stages of the 3D film open before the lock: at most three. */
export function visibleSceneCount(project: Project): number {
  return Math.min(3, visibleStageCount(project));
}

export interface ProjectView {
  /** Stages with prices; the rest are shown by name and machines only. */
  open: ProjectStage[];
  locked: { id: StageId; title: string; machines: string[] }[];
  machines: MachineType[];
  /** «от X ₽». */
  totalFrom: number;
  totalHigh: number | null;
  materials: MaterialQty[] | null;
}

/** What the visitor sees: the partial version unless unlocked. */
export function projectView(project: Project, unlocked: boolean): ProjectView {
  const n = unlocked ? project.stages.length : visibleStageCount(project);
  return {
    open: project.stages.slice(0, n),
    locked: project.stages.slice(n).map((s) => ({
      id: s.id,
      title: s.title,
      machines: [...new Set(s.rows.map((r) => r.name))],
    })),
    machines: project.machines,
    totalFrom: project.total,
    totalHigh: unlocked ? project.totalHigh : null,
    materials: unlocked ? project.materials : null,
  };
}

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

/** The plan as text for the dispatcher or WhatsApp; `full` false — the partial version. */
export function projectText(project: Project, full = true): string {
  const i = project.input;
  const spec = OBJECTS[i.object];
  const params = [
    `${fmt(i.length)}×${fmt(i.width)} м`,
    i.floors ? `${i.floors} эт.` : '',
    i.object === 'site' ? '' : `фундамент: ${FOUNDATIONS[i.foundation].toLowerCase()}`,
    `грунт: ${SOILS[i.soil].title.toLowerCase()}`,
    i.haul ? `вывоз ${fmt(i.distance)} км` : 'без вывоза',
  ].filter(Boolean);
  const head = `Примерная смета СпецПласт16 «Проект целиком»: ${spec.title} (${params.join(', ')}).`;
  const shown = project.stages.slice(0, full ? undefined : visibleStageCount(project));
  const tail = full
    ? `Техника СпецПласт16 итого примерно ${rub(project.total)} – ${rub(project.totalHigh)}, около ${project.days} дн. Прошу назвать точную цену.`
    : `Дальше ещё ${project.stages.length - shown.length} этап(а). Техника СпецПласт16 итого от ${rub(project.total)}. Прошу назвать точную цену.`;
  const detailed = [
    head,
    ...shown.map(
      (s, n) =>
        `${n + 1}. ${s.title}: ${s.rows.map((r) => `${r.name} ${r.hours} ч`).join(', ')} ≈ ${rub(s.cost)}, ~${s.days} дн.`,
    ),
    tail,
  ].join('\n');
  // The lead API takes up to 1000 characters: drop the machine details if needed.
  if (detailed.length <= LEAD_TEXT_MAX) return detailed;
  return [head, ...shown.map((s, n) => `${n + 1}. ${s.title} ≈ ${rub(s.cost)}`), tail]
    .join('\n')
    .slice(0, LEAD_TEXT_MAX);
}

/** The lead API limit for a message. */
export const LEAD_TEXT_MAX = 1000;
