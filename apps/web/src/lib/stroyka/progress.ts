// How far the /stroyka district has been built. No table of its own: the
// progress is derived from real time since the start date plus weighted
// counts of real activity on the site (leads, orders, bids, comments).
// One object takes about 4–6 weeks at modest traffic.

export const WORLD_START = Date.UTC(2026, 9, 1); // 2026-10-01
const DAY = 86_400_000;

/** Project units per day from time alone (one object in 7 weeks). */
export const BASE_PER_DAY = 1 / 49;
/** Project units per real event since the start date. */
export const WEIGHTS = { lead: 0.003, order: 0.004, bid: 0.0015, comment: 0.0008 } as const;

export interface Activity {
  leads: number;
  orders: number;
  bids: number;
  comments: number;
}
export const NO_ACTIVITY: Activity = { leads: 0, orders: 0, bids: 0, comments: 0 };

export const STAGES = [
  { key: 'pit', name: 'котлован', weight: 0.08 },
  { key: 'foundation', name: 'фундамент', weight: 0.1 },
  { key: 'frame', name: 'каркас', weight: 0.3 },
  { key: 'roof', name: 'кровля', weight: 0.06 },
  { key: 'facade', name: 'фасад', weight: 0.12 },
  { key: 'utilities', name: 'инженерные сети', weight: 0.08 },
  { key: 'interior', name: 'внутренняя отделка', weight: 0.14 },
  { key: 'landscape', name: 'благоустройство', weight: 0.08 },
  { key: 'handover', name: 'сдача объекта', weight: 0.04 },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export interface ProjectType {
  key: 'housing' | 'warehouse' | 'school' | 'mall';
  name: string;
  floors: number;
}

export const PROJECT_TYPES: ProjectType[] = [
  { key: 'housing', name: 'ЖК «Кама»', floors: 9 },
  { key: 'warehouse', name: 'Склад-логистический комплекс', floors: 2 },
  { key: 'school', name: 'Школа на 600 мест', floors: 3 },
  { key: 'mall', name: 'Торговый центр «Квартал»', floors: 3 },
];

/** The object built as project number `index`: the first is ЖК «Кама», then random but fixed. */
export function projectType(index: number): ProjectType {
  if (index <= 0) return PROJECT_TYPES[0]!;
  // Deterministic hash, never the same type twice in a row.
  const prev = projectType(index - 1);
  const h = Math.abs(Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
  const choices = PROJECT_TYPES.filter((t) => t.key !== prev.key);
  return choices[Math.floor(h * choices.length) % choices.length]!;
}

export interface WorldProgress {
  projectIndex: number;
  projectType: ProjectType['key'];
  projectName: string;
  floors: number;
  stage: number;
  stageKey: StageKey;
  stageName: string;
  /** 0…100 within the stage. */
  stagePercent: number;
  /** 0…100 of the whole object. */
  totalPercent: number;
  /** Floors of the frame standing (the frame stage fills them one by one). */
  floorsBuilt: number;
  finishedProjects: { index: number; type: ProjectType['key']; name: string; floors: number }[];
  nextMilestone: { stage: number; stageName: string; remainingPercent: number };
  /** Whether real activity counts were available (false: time-only fallback). */
  live: boolean;
}

/** Project units (1 = one object) at `now` with this activity. */
export function projectUnits(now: number, activity: Activity = NO_ACTIVITY): number {
  const days = Math.max(0, (now - WORLD_START) / DAY);
  return (
    days * BASE_PER_DAY +
    Math.max(0, activity.leads) * WEIGHTS.lead +
    Math.max(0, activity.orders) * WEIGHTS.order +
    Math.max(0, activity.bids) * WEIGHTS.bid +
    Math.max(0, activity.comments) * WEIGHTS.comment
  );
}

/** The district state for `units` of work. */
export function progressFromUnits(units: number, live = true): WorldProgress {
  const projectIndex = Math.floor(units);
  const within = units - projectIndex;
  const type = projectType(projectIndex);
  let acc = 0;
  let stage = 0;
  for (; stage < STAGES.length - 1; stage++) {
    if (within < acc + STAGES[stage]!.weight) break;
    acc += STAGES[stage]!.weight;
  }
  const info = STAGES[stage]!;
  const stageFraction = Math.min(1, Math.max(0, (within - acc) / info.weight));
  const floorsBuilt =
    stage < 2
      ? 0
      : stage === 2
        ? Math.min(type.floors, Math.floor(stageFraction * type.floors) + 1)
        : type.floors;
  const finishedProjects = [];
  for (let i = Math.max(0, projectIndex - 8); i < projectIndex; i++) {
    const t = projectType(i);
    finishedProjects.push({ index: i, type: t.key, name: t.name, floors: t.floors });
  }
  const nextStage = (stage + 1) % STAGES.length;
  return {
    projectIndex,
    projectType: type.key,
    projectName: type.name,
    floors: type.floors,
    stage,
    stageKey: info.key,
    stageName: info.name,
    stagePercent: Math.round(stageFraction * 100),
    totalPercent: Math.round(within * 100),
    floorsBuilt,
    finishedProjects,
    nextMilestone: {
      stage: nextStage,
      stageName: STAGES[nextStage]!.name,
      remainingPercent: Math.round((1 - stageFraction) * 100),
    },
    live,
  };
}

/** Progress at `now`; with no activity data (DB down) it is the time-only formula. */
export function worldProgress(now: number, activity: Activity | null): WorldProgress {
  return progressFromUnits(projectUnits(now, activity ?? NO_ACTIVITY), activity !== null);
}

/** «Объект: ЖК «Кама» — каркас, 7-й этаж из 9 · 63%». */
export function progressLine(p: WorldProgress): string {
  const detail =
    p.stageKey === 'frame'
      ? `каркас, ${p.floorsBuilt}-й этаж из ${p.floors}`
      : `${p.stageName} (этап ${p.stagePercent}%)`;
  return `Объект: ${p.projectName} — ${detail} · ${p.totalPercent}%`;
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
      : `Пока вас не было: сдали ${n} объекта, сейчас строим ${now.projectName}`;
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
