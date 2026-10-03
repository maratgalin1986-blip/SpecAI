// The /stroyka world's construction timeline: one object after another on
// its own plot, each going through the real stages of work with durations
// from common Russian practice. Pure calendar: progress depends only on the
// date (Moscow days since TIMELINE_START), so every visitor sees the same
// world on the same day, and it moves on by itself day by day. The objects
// are illustrative (like ЖК «Кама» always was), not company facts.
//
// API (for the engine, the passport, and the story texts):
//
//   progressAt(date)            → WorldProgress for a moment (ms). Main entry.
//   worldProgress(now, act)     → same, kept for old callers; `act` only sets `live`.
//   progressAtStage(i, key, f)  → the state of object i at fraction f of a stage (tests, previews).
//   progressFromUnits(u)        → object floor(u) at fraction u % 1 of its own duration (?progress=).
//   objectSchedule(i)           → object i: kind, name, plot, start/end and every stage's dates.
//   projectType(i)              → kind, name and floors of object i.
//   progressLine(p)             → «Объект: ЖК «Кама» — котлован (этап 70%) · 5%».
//   nextStageLine(p)            → «Дальше: фундамент — примерно с 15.10.2026».
//   finishedLine(p)             → «Сдано: ЖК «Кама» (04.2028), …» or null.
//   formatDate(ms), formatMonth(ms) → «15.10.2026», «04.2028» (Moscow time).
//   sinceLastVisit(before, now) → a short «Пока вас не было…» line.
//
// WorldProgress fields (all derived, nothing stored): projectIndex, projectType,
// projectName, floors, plot, stage/stageKey/stageName, stagePercent (0…100 within
// the stage), totalPercent (0…100 of the object), floorsBuilt, startedAt,
// stageStartedAt, finishAt, nextMilestone { stage, stageName, startsAt, daysLeft,
// remainingPercent }, nextProject { index, name, type, startsAt }, finishedProjects
// [{ index, type, name, floors, plot, startedAt, finishedAt }], date, live.

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;

/**
 * Day 0 of the world: ЖК «Кама» breaks ground on 5 September 2026, 00:00 MSK.
 * Chosen so that on 3 October 2026 (when the site went live with «котлован,
 * этап 70%») the pit is 28 of its 40 days in — 70%.
 */
export const TIMELINE_START = Date.UTC(2026, 8, 5) - MSK;
/** Old name of the start date (the API route and older code read it). */
export const WORLD_START = TIMELINE_START;

export const STAGES = [
  { key: 'pit', name: 'котлован' },
  { key: 'foundation', name: 'фундамент' },
  { key: 'frame', name: 'каркас' },
  { key: 'roof', name: 'кровля' },
  { key: 'facade', name: 'фасад' },
  { key: 'utilities', name: 'инженерные сети' },
  { key: 'interior', name: 'внутренняя отделка' },
  { key: 'landscape', name: 'благоустройство' },
  { key: 'handover', name: 'сдача объекта' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export type ObjectKind = 'housing' | 'kindergarten' | 'school' | 'sport' | 'clinic';

export interface ProjectType {
  key: ObjectKind;
  name: string;
  floors: number;
}

/**
 * Stage durations in days, per kind of object, in the STAGES order; the frame
 * is given per floor. Sequential (no overlap of trades), which is how the
 * site shows them; real projects overlap a little, so the totals are at the
 * longer end of the usual range.
 */
interface Recipe {
  floors: number;
  /** pit, foundation, [frame per floor], roof, facade, utilities, interior, landscape, handover */
  days: [number, number, number, number, number, number, number, number, number];
}

export const RECIPES: Record<ObjectKind, Recipe> = {
  // 17-storey monolithic residential block (typical for Челны). Котлован with
  // sheet piling ~1.3 months; фундаментная плита (подбетонка, гидроизоляция,
  // армирование, бетонирование, набор прочности) ~1.5 months; монолитный
  // каркас one floor per ~8 days (захватки, опалубка, бетон); кровля 1 month;
  // навесной фасад ~3.5 months; сети 2.5 + отделка 3 months (together ~5.5);
  // благоустройство ~1.7 months; ввод в эксплуатацию (ЗОС, разрешение) 1 month.
  // Total 601 days ≈ 20 months.
  housing: { floors: 17, days: [40, 45, 8, 30, 105, 75, 90, 50, 30] },
  // 3-storey kindergarten for 220 places: small pit, slab, a floor per ~12 days
  // (more partitions and openings per square metre than housing), kitchens,
  // ventilation, verandas and playgrounds. Total 326 days ≈ 11 months.
  kindergarten: { floors: 3, days: [20, 30, 12, 25, 45, 45, 60, 40, 25] },
  // 4-storey school for 825 places: big footprint, assembly and sports halls,
  // a floor per ~15 days; long fit-out (labs, canteen); stadium in the
  // landscaping. Total 450 days ≈ 15 months.
  school: { floors: 4, days: [30, 40, 15, 30, 60, 60, 90, 50, 30] },
  // 2-storey sports centre (ФОК) with a swimming pool: long spans, trusses
  // over the hall ~25 days per level, pool equipment in the utilities.
  // Total 355 days ≈ 12 months.
  sport: { floors: 2, days: [20, 35, 25, 35, 45, 45, 60, 40, 25] },
  // 4-storey outpatient clinic: dense engineering (ventilation, medical gases),
  // hence long utilities and fit-out. Total 411 days ≈ 13.5 months.
  clinic: { floors: 4, days: [25, 35, 14, 25, 55, 60, 90, 35, 30] },
};

/** Stage durations (days) of an object of this kind, frame expanded by floors. */
export function stageDays(kind: ObjectKind): number[] {
  const r = RECIPES[kind];
  return r.days.map((d, i) => (i === 2 ? d * r.floors : d));
}

/** Total working days of an object of this kind. */
export function objectDays(kind: ObjectKind): number {
  return stageDays(kind).reduce((a, b) => a + b, 0);
}

/** The catalogue of kinds (first-built names). */
export const PROJECT_TYPES: ProjectType[] = [
  { key: 'housing', name: 'ЖК «Кама»', floors: RECIPES.housing.floors },
  { key: 'kindergarten', name: 'Детский сад на 220 мест', floors: RECIPES.kindergarten.floors },
  { key: 'school', name: 'Школа на 825 мест', floors: RECIPES.school.floors },
  { key: 'sport', name: 'Физкультурно-оздоровительный комплекс', floors: RECIPES.sport.floors },
  { key: 'clinic', name: 'Поликлиника', floors: RECIPES.clinic.floors },
];

/**
 * Order of objects: ЖК «Кама» → детский сад → школа → ЖК «Кама-2», then the
 * cycle ФОК → поликлиника → ЖК → детский сад → школа → ЖК → …, so the
 * district grows the way a микрорайон does: homes first, then the social
 * infrastructure they need.
 */
const FIRST: ObjectKind[] = ['housing', 'kindergarten', 'school', 'housing'];
const CYCLE: ObjectKind[] = ['sport', 'clinic', 'housing', 'kindergarten', 'school', 'housing'];

function kindAt(index: number): ObjectKind {
  if (index < FIRST.length) return FIRST[Math.max(0, index)]!;
  return CYCLE[(index - FIRST.length) % CYCLE.length]!;
}

/** The object built as number `index` (0 = ЖК «Кама»). */
export function projectType(index: number): ProjectType {
  const kind = kindAt(index);
  // Which one of its kind this is (1-based), for the names.
  let n = 0;
  for (let i = 0; i <= Math.max(0, index); i++) if (kindAt(i) === kind) n++;
  const base = PROJECT_TYPES.find((t) => t.key === kind)!;
  let name = base.name;
  if (n > 1) {
    if (kind === 'housing') name = `ЖК «Кама-${n}»`;
    else if (kind === 'kindergarten') name = `Детский сад № ${n} на 220 мест`;
    else if (kind === 'school') name = `Школа № ${n} на 825 мест`;
    else name = `${base.name} № ${n}`;
  }
  return { key: kind, name, floors: base.floors };
}

// ---------------------------------------------------------------- plots

/**
 * Number of plots: plot 0 is the site inside the fence (ЖК «Кама»), plots
 * 1…OUTER_PLOTS are around it (their rectangles live in lib/stroyka/plots.ts).
 */
export const OUTER_PLOTS = 8;

/** The plot object `index` is built on. Plot 0 is only ever ЖК «Кама». */
export function plotOf(index: number): number {
  return index <= 0 ? 0 : 1 + ((index - 1) % OUTER_PLOTS);
}

// ---------------------------------------------------------------- schedule

export interface StageSchedule {
  key: StageKey;
  name: string;
  days: number;
  startsAt: number;
  endsAt: number;
}

export interface ObjectSchedule extends ProjectType {
  index: number;
  plot: number;
  /** Day numbers since TIMELINE_START. */
  startDay: number;
  endDay: number;
  startsAt: number;
  endsAt: number;
  stages: StageSchedule[];
}

const startDays: number[] = [0];
function startDayOf(index: number): number {
  while (startDays.length <= index) {
    const i = startDays.length - 1;
    startDays.push(startDays[i]! + objectDays(kindAt(i)));
  }
  return startDays[index]!;
}

const dayToMs = (day: number) => TIMELINE_START + day * DAY;

/** Object `index` with its plot, start, handover and every stage's dates. */
export function objectSchedule(index: number): ObjectSchedule {
  const type = projectType(index);
  const startDay = startDayOf(index);
  const days = stageDays(type.key);
  let at = startDay;
  const stages = STAGES.map((s, i) => {
    const from = at;
    at += days[i]!;
    return {
      key: s.key,
      name: s.name,
      days: days[i]!,
      startsAt: dayToMs(from),
      endsAt: dayToMs(at),
    };
  });
  return {
    ...type,
    index,
    plot: plotOf(index),
    startDay,
    endDay: at,
    startsAt: dayToMs(startDay),
    endsAt: dayToMs(at),
    stages,
  };
}

/** Whole Moscow days of work done by `date` (0 before the start). */
export function dayOf(date: number): number {
  return Math.max(0, Math.floor((date - TIMELINE_START) / DAY));
}

// ---------------------------------------------------------------- progress

export interface FinishedProject {
  index: number;
  type: ObjectKind;
  name: string;
  floors: number;
  plot: number;
  startedAt: number;
  finishedAt: number;
}

export interface WorldProgress {
  projectIndex: number;
  projectType: ObjectKind;
  projectName: string;
  floors: number;
  /** Plot of the current object (0 = inside the site fence). */
  plot: number;
  stage: number;
  stageKey: StageKey;
  stageName: string;
  /** 0…100 within the stage. */
  stagePercent: number;
  /** 0…100 of the whole object. */
  totalPercent: number;
  /** Floors of the frame standing (the frame stage fills them one by one). */
  floorsBuilt: number;
  startedAt: number;
  stageStartedAt: number;
  /** Planned handover (end of the last stage). */
  finishAt: number;
  /** Finished objects still standing, oldest first. */
  finishedProjects: FinishedProject[];
  nextMilestone: {
    stage: number;
    stageName: string;
    /** Left of the current stage, percent. */
    remainingPercent: number;
    /** When the next stage (or the next object's pit) begins. */
    startsAt: number;
    daysLeft: number;
  };
  nextProject: { index: number; name: string; type: ObjectKind; startsAt: number };
  /** The moment this state is for. */
  date: number;
  /** Computed by the server (true) or locally / for a preview (false). */
  live: boolean;
}

/** The world on work-day `day` (fractions allowed for previews). */
function progressAtDay(day: number, date: number, live: boolean): WorldProgress {
  let index = 0;
  while (startDayOf(index + 1) <= day) index++;
  const sched = objectSchedule(index);
  const within = day - sched.startDay;
  const days = sched.stages.map((s) => s.days);
  let acc = 0;
  let stage = 0;
  for (; stage < STAGES.length - 1; stage++) {
    if (within < acc + days[stage]!) break;
    acc += days[stage]!;
  }
  const stageFraction = Math.min(1, Math.max(0, (within - acc) / days[stage]!));
  const floorsBuilt =
    stage < 2
      ? 0
      : stage === 2
        ? Math.min(sched.floors, Math.floor(stageFraction * sched.floors) + 1)
        : sched.floors;
  const finishedProjects: FinishedProject[] = [];
  for (let i = 0; i < index; i++) {
    // An outer plot is reused after OUTER_PLOTS objects: the old one is gone.
    if (i > 0 && i + OUTER_PLOTS <= index) continue;
    const f = objectSchedule(i);
    finishedProjects.push({
      index: i,
      type: f.key,
      name: f.name,
      floors: f.floors,
      plot: f.plot,
      startedAt: f.startsAt,
      finishedAt: f.endsAt,
    });
  }
  const last = stage === STAGES.length - 1;
  const next = objectSchedule(index + 1);
  const nextStart = dayToMs(sched.startDay + acc + days[stage]!);
  return {
    projectIndex: index,
    projectType: sched.key,
    projectName: sched.name,
    floors: sched.floors,
    plot: sched.plot,
    stage,
    stageKey: STAGES[stage]!.key,
    stageName: STAGES[stage]!.name,
    stagePercent: Math.round(stageFraction * 100),
    totalPercent: Math.round((within / (sched.endDay - sched.startDay)) * 100),
    floorsBuilt,
    startedAt: sched.startsAt,
    stageStartedAt: dayToMs(sched.startDay + acc),
    finishAt: sched.endsAt,
    finishedProjects,
    nextMilestone: {
      stage: last ? 0 : stage + 1,
      stageName: last ? STAGES[0].name : STAGES[stage + 1]!.name,
      remainingPercent: Math.round((1 - stageFraction) * 100),
      startsAt: nextStart,
      daysLeft: Math.max(0, Math.ceil(sched.startDay + acc + days[stage]! - day)),
    },
    nextProject: { index: next.index, name: next.name, type: next.key, startsAt: next.startsAt },
    date,
    live,
  };
}

/** The world at `date` (ms). Whole Moscow days: the same all day for everyone. */
export function progressAt(date: number, live = false): WorldProgress {
  return progressAtDay(dayOf(date), date, live);
}

/** Old entry point: the world at `now`. Site activity no longer speeds it up. */
export function worldProgress(now: number, activity: Activity | null): WorldProgress {
  return progressAt(now, activity !== null);
}

/** Object `index` at fraction `f` (0…1) of stage `key` — for tests and previews. */
export function progressAtStage(index: number, key: StageKey, f = 0): WorldProgress {
  const s = objectSchedule(index);
  const k = STAGES.findIndex((st) => st.key === key);
  const stage = s.stages[k]!;
  const day =
    (stage.startsAt - TIMELINE_START) / DAY + Math.min(0.9999, Math.max(0, f)) * stage.days;
  return progressAtDay(day, dayToMs(day), false);
}

/** Object floor(units) at fraction units % 1 of its own duration (`?progress=`). */
export function progressFromUnits(units: number, live = true): WorldProgress {
  const index = Math.max(0, Math.floor(units));
  const s = objectSchedule(index);
  const day = s.startDay + (Math.max(0, units) - index) * (s.endDay - s.startDay);
  return progressAtDay(day, dayToMs(day), live);
}

/** Objects done by `now` as units: index + fraction of the current one. */
export function projectUnits(now: number): number {
  const p = progressAt(now);
  const s = objectSchedule(p.projectIndex);
  return p.projectIndex + (dayOf(now) - s.startDay) / (s.endDay - s.startDay);
}

/** Kept for the API route's signature; activity no longer moves the world. */
export interface Activity {
  leads: number;
  orders: number;
  bids: number;
  comments: number;
}
export const NO_ACTIVITY: Activity = { leads: 0, orders: 0, bids: 0, comments: 0 };

// ---------------------------------------------------------------- texts

/** «15.10.2026» in Moscow time. */
export function formatDate(ms: number): string {
  const d = new Date(ms + MSK);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

/** «04.2028» in Moscow time. */
export function formatMonth(ms: number): string {
  return formatDate(ms).slice(3);
}

/** «Объект: ЖК «Кама» — каркас, 7-й этаж из 17 · 31%». */
export function progressLine(p: WorldProgress): string {
  const detail =
    p.stageKey === 'frame'
      ? `каркас, ${p.floorsBuilt}-й этаж из ${p.floors}`
      : `${p.stageName} (этап ${p.stagePercent}%)`;
  return `Объект: ${p.projectName} — ${detail} · ${p.totalPercent}%`;
}

/** «Дальше: фундамент — примерно с 15.10.2026» (or the next object after handover). */
export function nextStageLine(p: WorldProgress): string {
  if (p.stageKey === 'handover')
    return `Дальше: ${p.nextProject.name} — примерно с ${formatDate(p.nextProject.startsAt)}`;
  return `Дальше: ${p.nextMilestone.stageName} — примерно с ${formatDate(p.nextMilestone.startsAt)}`;
}

/** «Сдано: ЖК «Кама» (04.2028), Детский сад на 220 мест (03.2029)» or null. */
export function finishedLine(p: WorldProgress): string | null {
  if (!p.finishedProjects.length) return null;
  return `Сдано: ${p.finishedProjects.map((f) => `${f.name} (${formatMonth(f.finishedAt)})`).join(', ')}`;
}

/** What changed since the visitor's last visit, or null. */
export function sinceLastVisit(
  before: Pick<WorldProgress, 'projectIndex' | 'stage' | 'floorsBuilt' | 'projectName'> | null,
  now: WorldProgress,
): string | null {
  if (!before) return null;
  if (now.projectIndex > before.projectIndex) {
    const n = now.projectIndex - before.projectIndex;
    return n === 1
      ? `Пока вас не было: сдали ${before.projectName} и начали ${now.projectName}`
      : `Пока вас не было: сдали ${n} ${plural(n, 'объект', 'объекта', 'объектов')}, сейчас строим ${now.projectName}`;
  }
  if (now.projectIndex < before.projectIndex) return null;
  if (
    now.stage === before.stage &&
    now.stageKey === 'frame' &&
    now.floorsBuilt > before.floorsBuilt
  ) {
    const n = now.floorsBuilt - before.floorsBuilt;
    return `Пока вас не было: залили ${n} ${plural(n, 'этаж', 'этажа', 'этажей')}`;
  }
  if (now.stage > before.stage) {
    if (before.stage <= 2 && now.stage > 2 && before.floorsBuilt < now.floors) {
      return `Пока вас не было: достроили каркас, теперь ${now.stageName}`;
    }
    return `Пока вас не было: закончили «${STAGES[before.stage]!.name}», теперь ${now.stageName}`;
  }
  return null;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** The machine a stage really needs (what the NPCs offer there). */
export const STAGE_MACHINE: Record<StageKey, import('@/lib/machinePhotos').MachineType> = {
  pit: 'backhoe',
  foundation: 'crane',
  frame: 'crane',
  roof: 'crane',
  facade: 'agp',
  utilities: 'backhoe',
  interior: 'kmu',
  landscape: 'roller',
  handover: 'loader',
};
