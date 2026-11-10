// Офис агентов: прогон одного шага плана (spec §4, R1, R4, R6). Создаёт запись журнала
// `OfficeRun`, ищет кандидатов в источнике (на сервере — 2ГИС и Nominatim; Overpass спрашивает
// раннер GitHub и присылает ответ: peekScheduledStep / ingestScheduledStep), отбрасывает
// компании с сайтом, ИП и людей (К5, `candidateFilter.ts`) и уже известные (тот же объект
// источника или телефон; для агента «Подрядчики» — ещё компании, которые уже на площадке), создаёт `Prospect` со статусом READY
// и досье (`dossier.ts`): соседи для подсчёта конкурентов — все названные объекты ниши из ответа;
// источник-выборка (Nominatim) конкурентов не даёт — чисел в досье нет.
// База и источник передаются зависимостями, чтобы логика проверялась без Postgres.

import { createHash } from 'node:crypto';
import { prisma } from '@specai/database';
import { cityByName, findCityInText } from '@specai/shared';
import { AGENTS, agentById } from './agents';
import { candidateSkipText } from './candidateFilter';
import { buildDossier, neighborsOf } from './dossier';
import { machineryTags, nicheByKey, type Niche } from './niches';
import { OFFICE_SETTINGS, defaultPlan, nextStep, parsePlan } from './plan';
import { prospectSlug, newToken } from './slug';
import { createDgisSource } from './sources/dgis';
import { withFallback } from './sources/fallback';
import { capWithoutSite } from './sources/limit';
import { nominatimSource } from './sources/nominatim';
import {
  OVERPASS_RELAY_MIRRORS,
  buildOverpassQuery,
  osmSource,
  parseOverpass,
  parseOverpassNeighbors,
} from './sources/osm';
import type { Candidate, Neighbor, ProspectSource, SourceNiche } from './sources/types';
import type { AgentId, PlanStep } from './types';

/** Радиус поиска вокруг центра города, км. */
export const STEP_RADIUS_KM = 15;
/** Сколько кандидатов берёт один шаг. */
export const STEP_LIMIT = 10;
/** Сколько фирм без сайта просить у источника (с сайтом приходят сверх лимита — соседи для досье): дедуп идёт до обрезки, иначе повтор шага по тому же городу вернул бы те же первые 10. */
export const SEARCH_LIMIT = 200;
/** Сколько компаний площадки сравнивать по цифрам телефона за один шаг. */
export const COMPANY_SCAN_LIMIT = 5000;

export type RunTrigger = 'cron' | 'admin' | 'telegram';

export interface RunStepInput {
  agent: AgentId;
  niche: string;
  city: string;
  trigger: RunTrigger;
  source?: ProspectSource;
  now?: Date;
  /** Сколько новых кандидатов создать за шаг (по умолчанию STEP_LIMIT). */
  stepLimit?: number;
}

export interface RunStepResult {
  runId: string;
  found: number;
  created: number;
  skipped: number;
  error: string | null;
}

export interface ProspectCreateData {
  kind: string;
  status: string;
  slug: string;
  token: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  niche: string;
  tags: string | null;
  hours: string | null;
  email: string | null;
  whatsapp: string | null;
  telegram: string | null;
  source: string;
  sourceRef: string;
  runId: string | null;
  /** JSON досье (`buildDossier`); null — не собрано. */
  dossierJson: string | null;
}

export interface OfficeRunCreateData {
  agent: string;
  niche: string;
  city: string;
  trigger: string;
  startedAt?: Date;
}

export interface OfficeRunUpdateData {
  found?: number;
  created?: number;
  skipped?: number;
  error?: string | null;
  finishedAt?: Date;
}

/** Минимум базы, который нужен прогону; `prisma` подходит как есть. */
export interface OfficeDb {
  prospect: {
    findMany(args: {
      where: { OR: [{ sourceRef: { in: string[] } }, { phone: { in: string[] } }] };
      select: { sourceRef: true; phone: true };
      take: number;
    }): Promise<{ sourceRef: string | null; phone: string }[]>;
    create(args: { data: ProspectCreateData }): Promise<{ id: string }>;
  };
  company: {
    findMany(args: {
      where: { phone: { not: null } };
      select: { phone: true };
      take: number;
    }): Promise<{ phone: string | null }[]>;
    findFirst(args: {
      where: { phone: { endsWith: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  officeRun: {
    create(args: { data: OfficeRunCreateData }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: OfficeRunUpdateData }): Promise<unknown>;
  };
  appSetting: {
    findMany(args: {
      where: { key: { in: string[] } };
      select: { key: true; value: true };
    }): Promise<{ key: string; value: string }[]>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
}

export interface RunDeps {
  db?: OfficeDb;
  source?: ProspectSource;
  /** Сколько миллисекунд есть у поиска (остаток времени функции крона). */
  budgetMs?: number;
}

function defaultDb(): OfficeDb {
  return prisma;
}

export function sourceNiche(niche: Niche): SourceNiche {
  return {
    key: niche.key,
    osm: niche.osm.tags.map(([k, v]) => [k, v] as [string, string]),
    nameRegex: niche.osm.nameRegex,
    osmNameFilter: niche.osm.osmNameFilter,
    dgisQuery: niche.osm.dgisQuery,
    machineryTags: niche.key === 'machinery' ? machineryTags : undefined,
  };
}

/**
 * Источник на сервере: 2ГИС первым, когда есть `DGIS_API_KEY`, затем Nominatim — он отвечает
 * облачным серверам. Overpass с Vercel не спрашивается: он сбрасывает соединение и только съедал
 * 25 с шага (продакшен 9–10.11.2026); его запрашивает раннер GitHub (`ingestScheduledStep`).
 */
export function defaultSource(): ProspectSource {
  const dgis = createDgisSource();
  return withFallback([...(dgis ? [dgis] : []), nominatimSource]);
}

/** Прямой Overpass — для ручных проверок и тестов; в серверной цепочке его нет. */
export { osmSource };

/** Последние 10 цифр телефона — так сравниваются `+7…`, `8…` и городские номера. */
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

interface CreateContext {
  agent: AgentId;
  niche: string;
  nicheTitle: string;
  /**
   * Все названные объекты ниши из ответа источника — соседи для подсчёта конкурентов в досье.
   * null — сравнивать не с чем (ручное добавление, источник-выборка): конкурентов в досье
   * нет, а не «ноль».
   */
  neighbors: readonly Neighbor[] | null;
  city: string | null;
  source: string;
  runId: string | null;
  db: OfficeDb;
}

export interface CreateResult {
  created: number;
  skipped: number;
  /** Почему пропущен каждый кандидат: «<название>: уже есть в кандидатах» и т. п. */
  errors: string[];
}

/**
 * Дедупликация и создание кандидатов (R6). Компания с сайтом, ИП и люди (К5) — мимо;
 * `Prospect` с тем же `sourceRef` или телефоном (любой статус) — skipped; для «Подрядчиков» — ещё `Company`
 * с тем же номером на площадке. Возвращает счётчики и причины пропусков.
 */
/** Кандидаты, которых ещё нет в базе (по идентификатору источника и телефону). */
async function dropKnown(candidates: readonly Candidate[], db: OfficeDb): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const known = await db.prospect.findMany({
    where: {
      OR: [
        { sourceRef: { in: candidates.map((c) => c.sourceRef) } },
        { phone: { in: candidates.map((c) => c.phone) } },
      ],
    },
    select: { sourceRef: true, phone: true },
    take: candidates.length * 2,
  });
  const refs = new Set(known.map((p) => p.sourceRef));
  const phones = new Set(known.map((p) => phoneTail(p.phone)));
  return candidates.filter((c) => !refs.has(c.sourceRef) && !phones.has(phoneTail(c.phone)));
}

/** Есть ли на площадке компания с этим номером (последние 10 цифр). */
async function companyWithPhone(db: OfficeDb, tail: string): Promise<boolean> {
  if (tail.length !== 10) return false;
  const direct = await db.company.findFirst({
    where: { phone: { endsWith: tail } },
    select: { id: true },
  });
  if (direct) return true;
  const companies = await db.company.findMany({
    where: { phone: { not: null } },
    select: { phone: true },
    take: COMPANY_SCAN_LIMIT,
  });
  return companies.some((c) => phoneTail(c.phone ?? '') === tail);
}

function dossierFor(c: Candidate, ctx: CreateContext, city: string | null) {
  const dossier = buildDossier({
    candidate: c,
    neighbors: ctx.neighbors ?? [],
    niche: ctx.niche,
    nicheTitle: ctx.nicheTitle,
    city,
  });
  return ctx.neighbors ? dossier : { ...dossier, competitors: null };
}

async function createProspects(
  candidates: readonly Candidate[],
  ctx: CreateContext,
): Promise<CreateResult> {
  const errors: string[] = [];
  const fresh = candidates.filter((c) => {
    if (c.website) {
      errors.push(`${c.name}: у компании уже есть сайт`);
      return false;
    }
    // К5: ИП и люди кандидатами не становятся.
    const personal = candidateSkipText(c.name);
    if (personal) {
      errors.push(personal);
      return false;
    }
    return true;
  });
  let skipped = candidates.length - fresh.length;
  if (fresh.length === 0) return { created: 0, skipped, errors };

  const known = await ctx.db.prospect.findMany({
    where: {
      OR: [
        { sourceRef: { in: fresh.map((c) => c.sourceRef) } },
        { phone: { in: fresh.map((c) => c.phone) } },
      ],
    },
    select: { sourceRef: true, phone: true },
    take: fresh.length * 2,
  });
  const knownRefs = new Set(known.map((p) => p.sourceRef).filter((r): r is string => !!r));
  const knownPhones = new Set(known.map((p) => phoneTail(p.phone)));
  const kind = AGENTS[ctx.agent].kind;

  let created = 0;
  for (const c of fresh) {
    const tail = phoneTail(c.phone);
    if (knownRefs.has(c.sourceRef) || knownPhones.has(tail)) {
      skipped += 1;
      errors.push(`${c.name}: уже есть в кандидатах`);
      continue;
    }
    if (ctx.agent === 'providers') {
      // Телефоны компаний хранятся как есть («+7 917 000-00-00», «89170000000»):
      // сравниваем по последним 10 цифрам в коде, а не в запросе.
      if (await companyWithPhone(ctx.db, tail)) {
        skipped += 1;
        errors.push(`${c.name}: компания с таким телефоном уже на площадке`);
        continue;
      }
    }
    const city =
      ctx.city ??
      (c.address ? (findCityInText(c.address, { address: true })?.city.name ?? null) : null);
    const data: Omit<ProspectCreateData, 'slug' | 'token'> = {
      kind,
      status: 'READY',
      name: c.name,
      phone: c.phone,
      address: c.address ?? null,
      city,
      lat: c.lat ?? null,
      lon: c.lon ?? null,
      niche: ctx.niche,
      tags: c.tags.length ? c.tags.join(',') : null,
      hours: c.hours ?? null,
      email: c.email ?? null,
      whatsapp: c.whatsapp ?? null,
      telegram: c.telegram ?? null,
      source: ctx.source,
      sourceRef: c.sourceRef,
      runId: ctx.runId,
      dossierJson: JSON.stringify(dossierFor(c, ctx, city)),
    };
    // Случайный хвост адреса совпадает редко; при совпадении — вторая попытка с новым.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ctx.db.prospect.create({
          data: { ...data, slug: prospectSlug(c.name, city ?? ''), token: newToken() },
        });
        created += 1;
        knownRefs.add(c.sourceRef);
        knownPhones.add(tail);
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 1) throw error;
      }
    }
  }
  return { created, skipped, errors };
}

function inputError(input: RunStepInput): string | null {
  const agent = agentById(input.agent);
  if (!agent) return `Неизвестный агент «${input.agent}»`;
  const niche = nicheByKey(input.niche);
  if (!niche) return `Неизвестная ниша «${input.niche}»`;
  if (niche.agent !== agent.id) return `Ниша «${niche.key}» не у агента «${agent.name}»`;
  if (!cityByName(input.city)) return `Город «${input.city}» не найден в списке городов`;
  return null;
}

/** Один шаг плана: журнал, поиск, дедупликация, создание кандидатов (spec §4). */
export async function runStep(input: RunStepInput, deps: RunDeps = {}): Promise<RunStepResult> {
  const db = deps.db ?? defaultDb();
  const source = input.source ?? deps.source ?? defaultSource();
  const now = input.now ?? new Date();
  const run = await db.officeRun.create({
    data: {
      agent: input.agent,
      niche: input.niche,
      city: input.city,
      trigger: input.trigger,
      startedAt: now,
    },
  });
  const result: RunStepResult = { runId: run.id, found: 0, created: 0, skipped: 0, error: null };
  const finish = async () => {
    await db.officeRun.update({
      where: { id: run.id },
      data: {
        found: result.found,
        created: result.created,
        skipped: result.skipped,
        error: result.error,
        finishedAt: new Date(),
      },
    });
    return result;
  };

  const invalid = inputError(input);
  if (invalid) {
    result.error = invalid;
    return finish();
  }
  const niche = nicheByKey(input.niche) as Niche;
  const city = cityByName(input.city) as NonNullable<ReturnType<typeof cityByName>>;

  try {
    const search = await source.search({
      niche: sourceNiche(niche),
      city: { name: city.name, lat: city.lat, lon: city.lon },
      radiusKm: STEP_RADIUS_KM,
      limit: SEARCH_LIMIT,
      ...(deps.budgetMs !== undefined ? { budgetMs: deps.budgetMs } : {}),
    });
    if (search.status !== 'ok') {
      result.error = search.error;
      return finish();
    }
    // Источник отдаёт всех: фирмы с сайтом — только соседи для досье, кандидатами не становятся.
    const withoutSite = search.candidates.filter((c) => !c.website);
    const withSite = search.candidates.length - withoutSite.length;
    // К5: ИП и люди — тоже только соседи; отсеиваем до обрезки, чтобы места шага шли компаниям.
    const companies = withoutSite.filter((c) => !candidateSkipText(c.name));
    const personal = withoutSite.length - companies.length;
    // Сначала убираем уже известных, потом берём первые STEP_LIMIT новых.
    const unknown = await dropKnown(companies, db);
    const alreadyKnown = companies.length - unknown.length;
    const candidates = unknown.slice(0, Math.max(1, input.stepLimit ?? STEP_LIMIT));
    result.found = search.candidates.length;
    const counts = await createProspects(candidates, {
      agent: input.agent,
      niche: niche.key,
      nicheTitle: niche.title,
      neighbors: search.sample ? null : (search.neighbors ?? neighborsOf(search.candidates)),
      city: city.name,
      source: source.id,
      runId: run.id,
      db,
    });
    result.created = counts.created;
    result.skipped = counts.skipped + alreadyKnown + withSite + personal;
  } catch (error) {
    console.error('[office/run] step failed', error);
    result.error = 'Шаг не выполнен: ошибка при сохранении кандидатов';
  }
  return finish();
}

/**
 * Кандидаты, добавленные владельцем вручную (R7): та же дедупликация и создание, без
 * журнала прогона. Ниша — `deps.niche`, иначе первая ниша агента по умолчанию; город —
 * из адреса строки. Досье — без соседей: конкурентов не с чем сравнить.
 */
export async function createManualProspects(
  agent: AgentId,
  candidates: readonly Candidate[],
  deps: RunDeps & { niche?: string } = {},
): Promise<CreateResult> {
  const db = deps.db ?? defaultDb();
  const niche = nicheByKey(deps.niche) ?? nicheByKey(AGENTS[agent].defaultNiches[0]);
  return createProspects(candidates, {
    agent,
    niche: niche?.key ?? AGENTS[agent].defaultNiches[0] ?? 'machinery',
    nicheTitle: niche?.title ?? '',
    neighbors: null,
    city: null,
    source: 'manual',
    runId: null,
    db,
  });
}

export type ScheduledStepResult =
  | { skipped: 'paused' | 'empty'; step: null; result: null }
  | { skipped: null; step: PlanStep; result: RunStepResult };

/**
 * Эпоха плана: при её смене обход начинается с первого шага. 2026-11-10: источник карт сутки не
 * отвечал и «съел» первые шаги (Казань, Набережные Челны), порядок плана изменился (три шага
 * «Сайтов» на один «Подрядчиков»), а поиск переехал на раннер GitHub с полным ответом Overpass.
 */
export const PLAN_EPOCH = '2026-11-10-relay';

/** Через раннер приходит весь ответ Overpass (сотни фирм на город) — за шаг берём больше. */
export const RELAY_STEP_LIMIT = 30;

const PLAN_KEYS = [
  OFFICE_SETTINGS.paused,
  OFFICE_SETTINGS.plan,
  OFFICE_SETTINGS.cursor,
  OFFICE_SETTINGS.planEpoch,
] as const;

/** Сколько раз подряд один шаг повторяется после сбоя сети раннера, прежде чем план пойдёт дальше. */
export const RELAY_RETRIES = 1;

/** Счётчик повторов шага: «<номер шага>:<сколько раз уже повторяли>»; пусто — повторов нет. */
async function readStepRetry(db: OfficeDb): Promise<{ raw: string; index: number; count: number }> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [OFFICE_SETTINGS.stepRetry] } },
    select: { key: true, value: true },
  });
  const raw = rows[0]?.value?.trim() ?? '';
  const match = /^(\d+):(\d+)$/.exec(raw);
  return match
    ? { raw, index: Number(match[1]), count: Number(match[2]) }
    : { raw, index: -1, count: 0 };
}

async function writeStepRetry(db: OfficeDb, value: string): Promise<void> {
  await db.appSetting.upsert({
    where: { key: OFFICE_SETTINGS.stepRetry },
    create: { key: OFFICE_SETTINGS.stepRetry, value },
    update: { value },
  });
}

/** Курсор плана вместе с эпохой, в которой он записан. */
async function writeCursor(db: OfficeDb, cursor: number): Promise<void> {
  await db.appSetting.upsert({
    where: { key: OFFICE_SETTINGS.cursor },
    create: { key: OFFICE_SETTINGS.cursor, value: String(cursor) },
    update: { value: String(cursor) },
  });
  await db.appSetting.upsert({
    where: { key: OFFICE_SETTINGS.planEpoch },
    create: { key: OFFICE_SETTINGS.planEpoch, value: PLAN_EPOCH },
    update: { value: PLAN_EPOCH },
  });
}

/** План и курсор из `AppSetting`; пустой или сломанный план → план по умолчанию. */
export function resolvePlan(rows: readonly { key: string; value: string }[]): {
  paused: boolean;
  steps: PlanStep[];
  cursor: number;
} {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const paused = byKey.get(OFFICE_SETTINGS.paused)?.trim() === '1';
  const planText = byKey.get(OFFICE_SETTINGS.plan) ?? '';
  const parsed = planText.trim() ? parsePlan(planText).steps : [];
  const steps = parsed.length ? parsed : defaultPlan();
  // Курсор прежней эпохи плана не действует: обход начинается сначала (PLAN_EPOCH).
  const sameEpoch = byKey.get(OFFICE_SETTINGS.planEpoch) === PLAN_EPOCH;
  const cursorRaw = sameEpoch ? Number.parseInt(byKey.get(OFFICE_SETTINGS.cursor) ?? '0', 10) : 0;
  const cursor = Number.isFinite(cursorRaw) && cursorRaw >= 0 ? cursorRaw : 0;
  return { paused, steps, cursor };
}

/**
 * Шаг по расписанию: читает паузу, план и курсор, сдвигает курсор ДО запуска (чтобы упавший
 * шаг не повторялся каждый час) и выполняет `runStep` с `trigger: 'cron'`.
 */
export async function runScheduledStep(
  now: Date = new Date(),
  deps: RunDeps = {},
): Promise<ScheduledStepResult> {
  const db = deps.db ?? defaultDb();
  const rows = await db.appSetting.findMany({
    where: { key: { in: [...PLAN_KEYS] } },
    select: { key: true, value: true },
  });
  const { paused, steps, cursor } = resolvePlan(rows);
  if (paused) return { skipped: 'paused', step: null, result: null };
  const { step, nextCursor } = nextStep(steps, cursor);
  if (!step) return { skipped: 'empty', step: null, result: null };
  await writeCursor(db, nextCursor);
  const result = await runStep(
    { ...step, trigger: 'cron', now },
    { db, source: deps.source, budgetMs: deps.budgetMs },
  );
  return { skipped: null, step, result };
}

/** Шаг плана под курсором и его отпечаток — чтобы ответ раннера приняли только для этого шага. */
export type PeekedStep =
  { skipped: 'paused' | 'empty' } | { index: number; key: string; step: PlanStep };

export function stepKey(index: number, step: PlanStep): string {
  return createHash('sha256')
    .update(`${index}|${step.agent};${step.niche};${step.city}`)
    .digest('hex')
    .slice(0, 16);
}

async function readPlan(db: OfficeDb) {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [...PLAN_KEYS] } },
    select: { key: true, value: true },
  });
  return resolvePlan(rows);
}

async function peekPlan(
  db: OfficeDb,
): Promise<
  | { skipped: 'paused' | 'empty' }
  | { index: number; key: string; step: PlanStep; nextCursor: number }
> {
  const { paused, steps, cursor } = await readPlan(db);
  if (paused) return { skipped: 'paused' };
  const { step, nextCursor } = nextStep(steps, cursor);
  if (!step) return { skipped: 'empty' };
  // nextStep отдаёт курсор следующего шага; номер текущего — на один назад по кругу.
  const index = (nextCursor - 1 + steps.length) % steps.length;
  return { index, key: stepKey(index, step), step, nextCursor };
}

/** Следующий шаг плана без запуска: читает паузу, план и курсор, курсор НЕ двигает. */
export async function peekScheduledStep(db: OfficeDb = defaultDb()): Promise<PeekedStep> {
  const peeked = await peekPlan(db);
  if ('skipped' in peeked) return peeked;
  return { index: peeked.index, key: peeked.key, step: peeked.step };
}

/**
 * Запрос Overpass для шага и зеркала для раннера. `query: null` — ниша или город шага не
 * найдены: раннер присылает ошибку, и шаг записывается в журнал с причиной (`runStep`).
 */
export function relayRequest(step: PlanStep): { query: string | null; mirrors: readonly string[] } {
  const niche = nicheByKey(step.niche);
  const city = cityByName(step.city);
  const query =
    niche && city
      ? buildOverpassQuery(
          sourceNiche(niche),
          { name: city.name, lat: city.lat, lon: city.lon },
          STEP_RADIUS_KM,
        )
      : null;
  return { query, mirrors: OVERPASS_RELAY_MIRRORS };
}

export const RELAY_BAD_ANSWER = 'Overpass прислал не тот ответ';
/** Сколько знаков текста ошибки раннера попадает в журнал. */
const RELAY_ERROR_MAX = 200;

/** Источник из готового ответа Overpass, который прислал раннер. */
function relayedSource(input: { overpass?: unknown; error?: string }): ProspectSource {
  return {
    id: 'osm',
    async search({ niche }) {
      if (input.error !== undefined) {
        const error = input.error.replace(/\s+/g, ' ').trim().slice(0, RELAY_ERROR_MAX);
        return { status: 'unavailable', error: error || RELAY_BAD_ANSWER };
      }
      const json = input.overpass as { elements?: unknown; remark?: unknown } | null | undefined;
      if (!json || typeof json !== 'object' || !Array.isArray(json.elements)) {
        return { status: 'unavailable', error: RELAY_BAD_ANSWER };
      }
      // Overpass отвечает 200 и на свой таймаут: пустой список и «remark: runtime error…».
      if (
        json.elements.length === 0 &&
        typeof json.remark === 'string' &&
        /error/i.test(json.remark)
      ) {
        return { status: 'unavailable', error: 'Overpass не успел выполнить запрос' };
      }
      return {
        status: 'ok',
        candidates: capWithoutSite(parseOverpass(json, niche), SEARCH_LIMIT),
        neighbors: parseOverpassNeighbors(json, niche),
      };
    },
  };
}

export type IngestResult = { status: 'stale' } | { status: 'done'; result: RunStepResult };

/**
 * Ответ раннера по шагу, который он получил из `peekScheduledStep`. Шаг под курсором уже
 * другой (план изменили, шаг сделал другой запуск, пауза) → 'stale', ничего не меняется.
 * Иначе курсор сдвигается ДО прогона, как в `runScheduledStep`, и шаг идёт с `trigger: 'cron'`:
 * `error` — в журнал как отказ источника, `overpass` — разбор и создание кандидатов.
 */
export async function ingestScheduledStep(
  input: {
    index: number;
    key: string;
    overpass?: unknown;
    error?: string;
    /** С `error`: не двигать курсор — источник был недоступен, шаг повторить. */
    retry?: boolean;
    now?: Date;
  },
  deps: RunDeps = {},
): Promise<IngestResult> {
  const db = deps.db ?? defaultDb();
  const peeked = await peekPlan(db);
  if ('skipped' in peeked || peeked.index !== input.index || peeked.key !== input.key) {
    return { status: 'stale' };
  }
  // Сеть раннера не достучалась ни до одного зеркала (`retry`): шаг записывается ошибкой, но
  // курсор стоит — тот же шаг повторится. Иначе сбой сети съел бы города и ниши до следующего
  // круга плана (так 9–10.11.2026 пропали первые шаги по Казани). Но не бесконечно: после
  // RELAY_RETRIES повторов того же шага план идёт дальше — один «тяжёлый» запрос не должен
  // заклинить весь обход (первый боевой прогон 10.11.2026 встал на спецтехнике Казани).
  const retry = input.error !== undefined && input.retry === true;
  const retried = await readStepRetry(db);
  const again = retried.index === peeked.index ? retried.count : 0;
  if (retry && again < RELAY_RETRIES) {
    await writeStepRetry(db, `${peeked.index}:${again + 1}`);
  } else {
    await writeCursor(db, peeked.nextCursor);
    if (retried.raw) await writeStepRetry(db, '');
  }
  const result = await runStep(
    {
      ...peeked.step,
      trigger: 'cron',
      source: relayedSource(input),
      now: input.now,
      stepLimit: RELAY_STEP_LIMIT,
    },
    { db },
  );
  return { status: 'done', result };
}
