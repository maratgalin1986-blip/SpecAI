import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import { parseDossier } from './dossier';
import { nicheByKey } from './niches';
import { OFFICE_SETTINGS, defaultPlan } from './plan';
import {
  SEARCH_LIMIT,
  createManualProspects,
  defaultSource,
  ingestScheduledStep,
  peekScheduledStep,
  relayRequest,
  sourceNiche,
  websiteIsFine,
  stepKey,
  phoneTail,
  resolvePlan,
  runScheduledStep,
  runStep,
  type OfficeDb,
  type ProspectCreateData,
  PLAN_EPOCH,
  RELAY_STEP_LIMIT,
  STEP_LIMIT,
  RETRY_AFTER_SUCCESS_MS,
  RELAY_RETRIES,
} from './run';
import type { Candidate, ProspectSource, SearchResult } from './sources/types';

type ProspectRow = ProspectCreateData & { id: string };
type RunRow = {
  id: string;
  agent: string;
  niche: string;
  city: string;
  trigger: string;
  found: number;
  created: number;
  skipped: number;
  error: string | null;
  finishedAt: Date | null;
  startedAt: Date;
};

/** База в памяти с теми же методами, что нужны прогону. */
function fakeDb(seed: { prospects?: Partial<ProspectRow>[]; companies?: string[] } = {}) {
  const prospects: ProspectRow[] = (seed.prospects ?? []).map((p, i) => ({
    id: `p${i}`,
    kind: 'site',
    status: 'READY',
    slug: `s${i}`,
    token: `t${i}`,
    name: 'x',
    phone: '+70000000000',
    address: null,
    city: null,
    lat: null,
    lon: null,
    niche: 'dentist',
    tags: null,
    hours: null,
    email: null,
    whatsapp: null,
    telegram: null,
    source: 'osm',
    sourceRef: `osm:node/${i}`,
    runId: null,
    dossierJson: null,
    ...p,
  }));
  const companies = (seed.companies ?? []).map((phone, i) => ({ id: `c${i}`, phone }));
  const runs: RunRow[] = [];
  /** «Сейчас» для отметки начала шага в журнале: тесты двигают его, чтобы состарить журнал. */
  const clock = { now: Date.parse('2026-11-10T12:00:00Z') };
  const settings = new Map<string, string>();
  let seq = 100;

  const db: OfficeDb = {
    prospect: {
      async findMany({ where, take }) {
        const refs = new Set(where.OR[0].sourceRef.in);
        const phones = new Set(where.OR[1].phone.in);
        return prospects
          .filter((p) => (p.sourceRef && refs.has(p.sourceRef)) || phones.has(p.phone))
          .slice(0, take)
          .map((p) => ({ sourceRef: p.sourceRef, phone: p.phone }));
      },
      async create({ data }) {
        if (prospects.some((p) => p.slug === data.slug || p.token === data.token)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = { ...data, id: `p${seq++}` };
        prospects.push(row);
        return { id: row.id };
      },
    },
    company: {
      async findFirst({ where }) {
        const hit = companies.find((c) => c.phone.endsWith(where.phone.endsWith));
        return hit ? { id: hit.id } : null;
      },
      async findMany({ take }) {
        return companies.slice(0, take).map((c) => ({ phone: c.phone }));
      },
    },
    officeRun: {
      async create({ data }) {
        const row: RunRow = {
          id: `r${seq++}`,
          agent: data.agent,
          niche: data.niche,
          city: data.city,
          trigger: data.trigger,
          found: 0,
          created: 0,
          skipped: 0,
          error: null,
          finishedAt: null,
          startedAt: new Date(clock.now),
        };
        runs.push(row);
        return { id: row.id };
      },
      async findMany({ where, take }) {
        return runs
          .filter((r) => r.trigger === where.trigger)
          .slice()
          .reverse()
          .slice(0, take)
          .map((r) => ({
            agent: r.agent,
            niche: r.niche,
            city: r.city,
            error: r.error,
            startedAt: r.startedAt,
          }));
      },
      async update({ where, data }) {
        const row = runs.find((r) => r.id === where.id);
        if (!row) throw new Error('no run');
        Object.assign(row, data);
        return row;
      },
    },
    appSetting: {
      async findMany({ where }) {
        return where.key.in
          .filter((k) => settings.has(k))
          .map((k) => ({ key: k, value: settings.get(k) as string }));
      },
      async upsert({ where, create }) {
        settings.set(where.key, create.value);
        return null;
      },
    },
  };
  return { db, prospects, runs, settings, clock };
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    name: 'Стоматология Улыбка',
    phone: '+78432001122',
    address: 'ул. Баумана, 1, Казань',
    lat: 55.79,
    lon: 49.1,
    hours: 'Mo-Fr 09:00-20:00',
    website: null,
    email: 'info@ulybka.ru',
    whatsapp: null,
    telegram: 'ulybka_kzn',
    tags: [],
    sourceRef: 'osm:node/1',
    ...over,
  };
}

function source(result: SearchResult, calls: unknown[] = []): ProspectSource {
  return {
    id: 'osm',
    async search(input) {
      calls.push(input);
      return result;
    },
  };
}

const ok = (candidates: Candidate[]): SearchResult => ({ status: 'ok', candidates });

describe('runStep', () => {
  it('создаёт кандидатов READY с данными карточки, slug, token и runId', async () => {
    const { db, prospects, runs } = fakeDb();
    const calls: { radiusKm: number; limit: number; city: { name: string } }[] = [];
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'admin' },
      { db, source: source(ok([candidate()]), calls) },
    );
    expect(result).toMatchObject({ found: 1, created: 1, skipped: 0, error: null });
    expect(calls[0]).toMatchObject({ radiusKm: 15, limit: SEARCH_LIMIT, city: { name: 'Казань' } });
    expect(prospects).toHaveLength(1);
    const p = prospects[0] as ProspectRow;
    expect(p).toMatchObject({
      kind: 'site',
      status: 'READY',
      niche: 'dentist',
      city: 'Казань',
      email: 'info@ulybka.ru',
      telegram: 'ulybka_kzn',
      source: 'osm',
      sourceRef: 'osm:node/1',
      runId: result.runId,
    });
    expect(p.slug).toMatch(/^stomatologiya-ulybka-kazan-[a-z0-9]{4}$/);
    expect(p.token).toMatch(/^[0-9a-f]{32}$/);
    expect(runs[0]).toMatchObject({ trigger: 'admin', found: 1, created: 1, error: null });
    expect(runs[0]?.finishedAt).toBeInstanceOf(Date);
  });

  it('пропускает компании с сайтом и дубли по sourceRef и телефону', async () => {
    const { db, prospects } = fakeDb({
      prospects: [
        { sourceRef: 'osm:node/1', phone: '+70000000001' },
        { sourceRef: 'osm:way/9', phone: '+78432001199' },
      ],
    });
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source(
          ok([
            candidate({ sourceRef: 'osm:node/1', phone: '+78432000000' }), // тот же объект
            candidate({ sourceRef: 'osm:node/2', phone: '+78432001199' }), // тот же телефон
            candidate({ sourceRef: 'osm:node/3', phone: '+78432000003', website: 'https://a.ru' }),
            candidate({ sourceRef: 'osm:node/4', phone: '+78432000004' }),
          ]),
        ),
      },
    );
    expect(result).toMatchObject({ found: 4, created: 1, skipped: 3, error: null });
    expect(prospects.map((p) => p.sourceRef)).toContain('osm:node/4');
  });

  it('пишет досье: конкуренты посчитаны по всему ответу источника, фирмы с сайтом кандидатами не стали', async () => {
    const { db, prospects } = fakeDb();
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source(
          ok([
            candidate({ sourceRef: 'osm:node/1', phone: '+78432000001' }),
            // рядом, с сайтом — только сосед
            candidate({
              sourceRef: 'osm:node/2',
              phone: '+78432000002',
              lat: 55.791,
              lon: 49.101,
              website: 'https://dent.ru',
            }),
            // рядом, без сайта — и сосед, и кандидат
            candidate({ sourceRef: 'osm:node/3', phone: '+78432000003', lat: 55.792, lon: 49.1 }),
            // далеко (больше 2 км), с сайтом — не конкурент «рядом»
            candidate({
              sourceRef: 'osm:node/4',
              phone: '+78432000004',
              lat: 55.9,
              lon: 49.3,
              website: 'https://far.ru',
            }),
          ]),
        ),
      },
    );
    expect(result).toMatchObject({ found: 4, created: 2, skipped: 2, error: null });
    expect(prospects.map((p) => p.sourceRef)).toEqual(['osm:node/1', 'osm:node/3']);
    const dossier = parseDossier(prospects[0]!.dossierJson);
    expect(dossier).toMatchObject({
      niche: 'dentist',
      nicheTitle: 'Стоматология',
      city: 'Казань',
      competitors: { radiusKm: 2, sameNiche: 2, withSite: 1 },
      channels: { email: true, whatsapp: false, telegram: true },
    });
    expect(dossier!.gaps[0]).toBe('нет своего сайта');
    expect(dossier!.facts).toContain('адрес: ул. Баумана, 1, Казань');
    expect(parseDossier(prospects[1]!.dossierJson)!.competitors).toEqual({
      radiusKm: 2,
      sameNiche: 2,
      withSite: 1,
    });
  });

  it('дедуп идёт до обрезки: повтор шага по тому же городу находит новых, а не те же первые 10', async () => {
    const { db, prospects } = fakeDb({
      prospects: Array.from({ length: 10 }, (_, i) => ({
        sourceRef: `osm:node/${i}`,
        phone: `+7843200${String(i).padStart(4, '0')}`,
      })),
    });
    const list = Array.from({ length: 14 }, (_, i) =>
      candidate({ sourceRef: `osm:node/${i}`, phone: `+7843200${String(i).padStart(4, '0')}` }),
    );
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      { db, source: source(ok(list)) },
    );
    expect(result).toMatchObject({ found: 14, created: 4, skipped: 10 });
    expect(prospects).toHaveLength(14);
  });

  it('телефон компании в любом формате («+7 917 000-11-22») узнаётся по последним 10 цифрам', async () => {
    const { db, prospects } = fakeDb({ companies: ['+7 917 000-11-22'] });
    const result = await runStep(
      { agent: 'providers', niche: 'machinery', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source(ok([candidate({ name: 'Аренда экскаваторов', phone: '+79170001122' })])),
      },
    );
    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(prospects).toHaveLength(0);
  });

  it('для «Подрядчиков» пропускает компании, которые уже на площадке; для «Сайтов» — нет', async () => {
    const machinery = candidate({
      name: 'Аренда экскаваторов Татарстан',
      phone: '+79170001122',
      sourceRef: 'osm:node/7',
      tags: ['excavators'],
    });
    const a = fakeDb({ companies: ['89170001122'] });
    const providers = await runStep(
      { agent: 'providers', niche: 'machinery', city: 'Казань', trigger: 'cron' },
      { db: a.db, source: source(ok([machinery])) },
    );
    expect(providers).toMatchObject({ found: 1, created: 0, skipped: 1 });

    const b = fakeDb({ companies: ['+78432001122'] });
    const sites = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      { db: b.db, source: source(ok([candidate()])) },
    );
    expect(sites).toMatchObject({ found: 1, created: 1, skipped: 0 });
  });

  it('кандидат «Подрядчиков» получает kind provider и виды техники через запятую', async () => {
    const { db, prospects } = fakeDb();
    await runStep(
      { agent: 'providers', niche: 'machinery', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source(
          ok([
            candidate({ name: 'СпецТех', tags: ['excavators', 'cranes'], sourceRef: 'osm:node/8' }),
          ]),
        ),
      },
    );
    expect(prospects[0]).toMatchObject({ kind: 'provider', tags: 'excavators,cranes' });
  });

  it('источник не ответил → ошибка в журнале, кандидатов нет', async () => {
    const { db, prospects, runs } = fakeDb();
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      { db, source: source({ status: 'unavailable', error: 'Источник карт не ответил' }) },
    );
    expect(result).toMatchObject({ found: 0, created: 0, error: 'Источник карт не ответил' });
    expect(prospects).toHaveLength(0);
    expect(runs[0]?.error).toBe('Источник карт не ответил');
    expect(runs[0]?.finishedAt).toBeInstanceOf(Date);
  });

  it('неизвестный город или ниша → OfficeRun с ошибкой, источник не вызывается', async () => {
    const { db, runs } = fakeDb();
    const calls: unknown[] = [];
    const src = source(ok([candidate()]), calls);
    const city = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Нет Такого', trigger: 'admin' },
      { db, source: src },
    );
    expect(city.error).toContain('Нет Такого');
    const niche = await runStep(
      { agent: 'sites', niche: 'machinery', city: 'Казань', trigger: 'admin' },
      { db, source: src },
    );
    expect(niche.error).toContain('machinery');
    expect(calls).toHaveLength(0);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.error && r.finishedAt)).toBe(true);
  });

  it('при совпадении slug повторяет создание с другим хвостом', async () => {
    const { db, prospects } = fakeDb();
    const original = db.prospect.create.bind(db.prospect);
    let first = true;
    db.prospect.create = async (args) => {
      if (first) {
        first = false;
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      return original(args);
    };
    const result = await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      { db, source: source(ok([candidate()])) },
    );
    expect(result).toMatchObject({ created: 1, error: null });
    expect(prospects).toHaveLength(1);
  });

  it('К5: ИП и люди не становятся кандидатами, но остаются соседями в досье', async () => {
    const { db, prospects } = fakeDb();
    const result = await runStep(
      { agent: 'sites', niche: 'car_repair', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source(
          ok([
            candidate({ name: 'ИП Петров', sourceRef: 'osm:node/1', phone: '+78432000001' }),
            candidate({
              name: 'Иванов Иван Иванович',
              sourceRef: 'osm:node/2',
              phone: '+78432000002',
            }),
            candidate({ name: 'Автосервис Мотор', sourceRef: 'osm:node/3', phone: '+78432000003' }),
          ]),
        ),
      },
    );
    expect(result).toMatchObject({ found: 3, created: 1, skipped: 2, error: null });
    expect(prospects.map((p) => p.name)).toEqual(['Автосервис Мотор']);
    // Соседи для подсчёта конкурентов — весь ответ источника, вместе с ИП.
    expect(parseDossier(prospects[0]!.dossierJson)!.competitors).toMatchObject({ sameNiche: 2 });
  });

  it('К5: ИП отсеиваются до обрезки — места шага достаются компаниям', async () => {
    const { db, prospects } = fakeDb();
    const persons = Array.from({ length: 12 }, (_, i) =>
      candidate({
        name: `ИП Петров ${i}`,
        sourceRef: `osm:node/${i}`,
        phone: `+7843200${1000 + i}`,
      }),
    );
    const company = candidate({
      name: 'Автосервис Мотор',
      sourceRef: 'osm:node/99',
      phone: '+78432009999',
    });
    const result = await runStep(
      { agent: 'sites', niche: 'car_repair', city: 'Казань', trigger: 'cron' },
      { db, source: source(ok([...persons, company])) },
    );
    expect(result).toMatchObject({ found: 13, created: 1, skipped: 12 });
    expect(prospects.map((p) => p.name)).toEqual(['Автосервис Мотор']);
  });
});

describe('createManualProspects', () => {
  it('создаёт вручную добавленных с городом из адреса и источником manual', async () => {
    const { db, prospects } = fakeDb({ prospects: [{ phone: '+79170000002' }] });
    const result = await createManualProspects(
      'providers',
      [
        candidate({
          name: 'Кран-Сервис',
          phone: '+79170000001',
          address: 'Набережные Челны, пр. Мира 1',
          sourceRef: 'manual:+79170000001',
        }),
        candidate({ phone: '+79170000002', sourceRef: 'manual:+79170000002' }),
      ],
      { db },
    );
    expect(result).toEqual({
      created: 1,
      skipped: 1,
      errors: ['Стоматология Улыбка: уже есть в кандидатах'],
    });
    expect(prospects.at(-1)).toMatchObject({
      kind: 'provider',
      niche: 'machinery',
      city: 'Набережные Челны',
      source: 'manual',
      runId: null,
    });
    // Досье без соседей: конкурентов не с чем сравнить — null, а не «ноль рядом».
    const dossier = parseDossier(prospects.at(-1)!.dossierJson);
    expect(dossier).toMatchObject({
      niche: 'machinery',
      city: 'Набережные Челны',
      competitors: null,
    });
    expect(dossier!.facts).toContain('адрес: Набережные Челны, пр. Мира 1');
  });

  it('К5: вручную добавленные ИП и люди пропускаются с причиной', async () => {
    const { db, prospects } = fakeDb();
    const result = await createManualProspects(
      'sites',
      [
        candidate({ name: 'ИП Сидорова', phone: '+79170000011', sourceRef: 'manual:1' }),
        candidate({ name: 'Ольга Петровна', phone: '+79170000012', sourceRef: 'manual:2' }),
        candidate({ name: 'Цветочная лавка', phone: '+79170000013', sourceRef: 'manual:3' }),
      ],
      { db },
    );
    expect(result).toEqual({
      created: 1,
      skipped: 2,
      errors: [
        'ИП Сидорова: индивидуальный предприниматель — не пишем',
        'Ольга Петровна: название похоже на имя человека — не пишем',
      ],
    });
    expect(prospects.map((p) => p.name)).toEqual(['Цветочная лавка']);
    // Ниша по умолчанию — первая ниша агента, не медицинская.
    expect(prospects[0]!.niche).toBe('car_repair');
  });
});

describe('runScheduledStep', () => {
  it('двигает курсор до шага и идёт по кругу', async () => {
    const { db, settings, runs } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, 'sites; dentist; Казань\nproviders; machinery; Уфа');
    const src = source(ok([]));
    const first = await runScheduledStep(new Date(), { db, source: src });
    expect(first.step).toEqual({ agent: 'sites', niche: 'dentist', city: 'Казань' });
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    const second = await runScheduledStep(new Date(), { db, source: src });
    expect(second.step).toEqual({ agent: 'providers', niche: 'machinery', city: 'Уфа' });
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('0');
    const third = await runScheduledStep(new Date(), { db, source: src });
    expect(third.step?.city).toBe('Казань');
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.trigger === 'cron')).toBe(true);
  });

  it('курсор сдвигается даже когда источник не ответил', async () => {
    const { db, settings } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, 'sites; dentist; Казань\nproviders; machinery; Уфа');
    const result = await runScheduledStep(new Date(), {
      db,
      source: source({ status: 'unavailable', error: 'Источник карт не ответил' }),
    });
    expect(result.result?.error).toBe('Источник карт не ответил');
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
  });

  it('на паузе шаг не идёт и курсор не двигается', async () => {
    const { db, settings, runs } = fakeDb();
    settings.set(OFFICE_SETTINGS.paused, '1');
    const calls: unknown[] = [];
    const result = await runScheduledStep(new Date(), { db, source: source(ok([]), calls) });
    expect(result).toEqual({ skipped: 'paused', step: null, result: null });
    expect(calls).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(settings.has(OFFICE_SETTINGS.cursor)).toBe(false);
  });

  it('пустой или сломанный план → план по умолчанию', () => {
    expect(resolvePlan([]).steps).toEqual(defaultPlan());
    expect(resolvePlan([{ key: OFFICE_SETTINGS.plan, value: 'ерунда' }]).steps).toEqual(
      defaultPlan(),
    );
    expect(resolvePlan([{ key: OFFICE_SETTINGS.cursor, value: '-5' }]).cursor).toBe(0);
  });
});

describe('соседи для досье', () => {
  it('источник-выборка: конкурентов в досье нет — чисел не показываем', async () => {
    const { db, prospects } = fakeDb();
    await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source({
          status: 'ok',
          sample: true,
          candidates: [
            candidate({ sourceRef: 'osm:node/1', phone: '+78432000001' }),
            candidate({ sourceRef: 'osm:node/2', phone: '+78432000002', website: 'https://d.ru' }),
          ],
        }),
      },
    );
    expect(prospects).toHaveLength(1);
    const dossier = parseDossier(prospects[0]!.dossierJson);
    expect(dossier!.competitors).toBeNull();
    expect(dossier!.gaps[0]).toBe('нет своего сайта');
  });

  it('список соседей от источника главнее кандидатов: считаются и объекты без телефона', async () => {
    const { db, prospects } = fakeDb();
    await runStep(
      { agent: 'sites', niche: 'dentist', city: 'Казань', trigger: 'cron' },
      {
        db,
        source: source({
          status: 'ok',
          candidates: [candidate({ sourceRef: 'osm:node/1' })],
          neighbors: [
            { ref: 'osm:node/1', lat: 55.79, lon: 49.1, hasSite: false },
            { ref: 'osm:node/7', lat: 55.791, lon: 49.1, hasSite: true },
            { ref: 'osm:node/8', lat: 55.792, lon: 49.1, hasSite: false },
          ],
        }),
      },
    );
    expect(parseDossier(prospects[0]!.dossierJson)!.competitors).toEqual({
      radiusKm: 2,
      sameNiche: 2,
      withSite: 1,
    });
  });
});

describe('поиск через раннер: peekScheduledStep / ingestScheduledStep', () => {
  const PLAN = 'sites; dentist; Казань\nproviders; machinery; Уфа';
  const el = (id: number, tags: Record<string, string>) => ({
    type: 'node',
    id,
    lat: 55.79 + id / 10_000,
    lon: 49.1,
    tags,
  });
  const overpass = {
    elements: [
      el(1, { name: 'Дента', phone: '+7 843 200-00-01' }),
      el(2, { name: 'Улыбка', phone: '+7 843 200-00-02', website: 'https://u.example' }),
      el(3, { name: 'Без телефона' }),
      el(4, { name: 'Без телефона с сайтом', 'contact:website': 'https://b.example' }),
    ],
  };

  it('peek не двигает курсор и не пишет журнал; ключ зависит от номера и шага', async () => {
    const { db, settings, runs } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    const first = await peekScheduledStep(db);
    expect(first).toEqual({
      index: 0,
      key: stepKey(0, { agent: 'sites', niche: 'dentist', city: 'Казань' }),
      step: { agent: 'sites', niche: 'dentist', city: 'Казань' },
    });
    expect(await peekScheduledStep(db)).toEqual(first);
    expect(settings.has(OFFICE_SETTINGS.cursor)).toBe(false);
    expect(runs).toHaveLength(0);
    expect('key' in first && first.key).toMatch(/^[0-9a-f]{16}$/);
    expect(stepKey(1, { agent: 'sites', niche: 'dentist', city: 'Казань' })).not.toBe(
      'key' in first && first.key,
    );
    settings.set(OFFICE_SETTINGS.paused, '1');
    expect(await peekScheduledStep(db)).toEqual({ skipped: 'paused' });
  });

  it('ответ Overpass: курсор вперёд, кандидат создан, соседи — все названные объекты', async () => {
    const { db, settings, runs, prospects } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    const peeked = await peekScheduledStep(db);
    if ('skipped' in peeked) throw new Error('шаг ожидался');
    const done = await ingestScheduledStep(
      { index: peeked.index, key: peeked.key, overpass },
      { db },
    );
    expect(done).toMatchObject({
      status: 'done',
      result: { found: 2, created: 1, skipped: 1, error: null },
    });
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: 'cron', niche: 'dentist', city: 'Казань' });
    expect(prospects[0]).toMatchObject({ source: 'osm', sourceRef: 'osm:node/1' });
    // Три соседа рядом (2, 3, 4), у двух — сайт: объекты без телефона тоже посчитаны.
    expect(parseDossier(prospects[0]!.dossierJson)!.competitors).toEqual({
      radiusKm: 2,
      sameNiche: 3,
      withSite: 2,
    });
  });

  it('чужой ключ или уже сделанный шаг → stale: ни курсора, ни журнала', async () => {
    const { db, settings, runs } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    const peeked = await peekScheduledStep(db);
    if ('skipped' in peeked) throw new Error('шаг ожидался');
    expect(
      await ingestScheduledStep({ index: 0, key: '0000000000000000', overpass }, { db }),
    ).toEqual({ status: 'stale' });
    expect(await ingestScheduledStep({ index: 1, key: peeked.key, overpass }, { db })).toEqual({
      status: 'stale',
    });
    expect(settings.has(OFFICE_SETTINGS.cursor)).toBe(false);
    expect(runs).toHaveLength(0);
    // Тот же ответ второй раз не принимается: курсор уже на следующем шаге.
    await ingestScheduledStep({ index: 0, key: peeked.key, overpass }, { db });
    expect(await ingestScheduledStep({ index: 0, key: peeked.key, overpass }, { db })).toEqual({
      status: 'stale',
    });
    expect(runs).toHaveLength(1);
  });

  it('ошибка раннера и не тот ответ записываются в журнал отказом, курсор идёт дальше', async () => {
    const { db, settings, runs, prospects } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    const first = await peekScheduledStep(db);
    if ('skipped' in first) throw new Error('шаг ожидался');
    const failed = await ingestScheduledStep(
      { index: first.index, key: first.key, error: 'Overpass не ответил с раннера GitHub' },
      { db },
    );
    expect(failed).toMatchObject({
      status: 'done',
      result: { found: 0, created: 0, error: 'Overpass не ответил с раннера GitHub' },
    });
    expect(runs[0]!.error).toBe('Overpass не ответил с раннера GitHub');
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    const second = await peekScheduledStep(db);
    if ('skipped' in second) throw new Error('шаг ожидался');
    const bad = await ingestScheduledStep(
      { index: second.index, key: second.key, overpass: { remark: 'runtime error', elements: [] } },
      { db },
    );
    expect(bad.status === 'done' && bad.result.error).toBeTruthy();
    expect(prospects).toHaveLength(0);
  });

  const NO_ANSWER = 'Overpass не ответил с раннера GitHub';
  const PLAN3 = `${PLAN}\nsites; beauty; Казань`;
  const fail = (db: OfficeDb, step: { index: number; key: string }, now?: Date) =>
    ingestScheduledStep(
      { index: step.index, key: step.key, error: NO_ANSWER, retry: true, now },
      { db },
    );
  const ok = (db: OfficeDb, step: { index: number; key: string }) =>
    ingestScheduledStep({ index: step.index, key: step.key, overpass }, { db });
  const peek = async (db: OfficeDb, now?: Date) => {
    const step = await peekScheduledStep(db, now);
    if ('skipped' in step) throw new Error('шаг ожидался');
    return step;
  };

  it('retry: Overpass не ответил — отказ в журнале, план идёт дальше, шаг отложен и повторяется после чужого успеха', async () => {
    const { db, settings, runs, clock } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN3);
    const at = () => new Date(clock.now);
    const first = await peek(db, at());
    expect(first.index).toBe(0);
    await fail(db, first, at());
    expect(runs[0]!.error).toBe(NO_ANSWER);
    // Курсор ушёл дальше: один шаг не заклинит обход; шаг 0 записан как отложенный.
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe(`0:0:${first.key}`);
    // Сразу после отказа повтор не отдаётся: нет свежего успеха.
    const second = await peek(db, at());
    expect(second.index).toBe(1);
    await ok(db, second);
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('2');
    // Соседний шаг только что прошёл — Overpass отвечает: теперь отдаётся отложенный шаг 0,
    // но с другим ключом: запоздавший ответ по первой выдаче за повтор не примется.
    const again = await peek(db, at());
    expect(again).toMatchObject({ index: first.index, step: first.step });
    expect(again.key).not.toBe(first.key);
    expect(await fail(db, first, at())).toEqual({ status: 'stale' });
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe(`0:0:${first.key}`);
    await ok(db, again);
    expect(runs[2]).toMatchObject({ niche: 'dentist', error: null });
    // Повтор курсор не трогает, место освободилось, обход продолжается с шага 2.
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('2');
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe('');
    expect((await peek(db, at())).index).toBe(2);
  });

  it('retry: повтор тоже не удался — после RELAY_RETRIES повторов шаг снят, обход не блокируется', async () => {
    const { db, settings, runs, clock } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN3);
    const at = () => new Date(clock.now);
    expect(RELAY_RETRIES).toBe(1);
    const first = await peek(db, at());
    await fail(db, first, at());
    await ok(db, await peek(db, at()));
    const again = await peek(db, at());
    expect(again.index).toBe(first.index);
    await fail(db, again, at());
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe('');
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('2');
    expect(runs.filter((r) => r.error === NO_ANSWER)).toHaveLength(2);
    expect((await peek(db, at())).index).toBe(2);
  });

  it('retry: место одно — второй отказ подряд остаётся только в журнале; старый успех повтора не запускает', async () => {
    const { db, settings, clock } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN3);
    const at = () => new Date(clock.now);
    const first = await peek(db, at());
    await fail(db, first, at());
    const second = await peek(db, at());
    await fail(db, second, at());
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe(`0:0:${first.key}`);
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('2');
    const third = await peek(db, at());
    await ok(db, third);
    // Успех был, но давно (следующий запуск раннера через часы): сначала шаг под курсором.
    clock.now += RETRY_AFTER_SUCCESS_MS + 60_000;
    expect((await peek(db, at())).index).toBe(0);
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('0');
  });

  it('ответ по отложенному шагу принимается и тогда, когда свежесть успеха уже истекла', async () => {
    const { db, settings, clock } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN3);
    const at = () => new Date(clock.now);
    const first = await peek(db, at());
    await fail(db, first, at());
    await ok(db, await peek(db, at()));
    const again = await peek(db, at());
    expect(again.index).toBe(0);
    // Раннер качал Overpass дольше окна свежести — ответ всё равно относится к отложенному шагу.
    clock.now += RETRY_AFTER_SUCCESS_MS + 60_000;
    expect(await ok(db, again)).toMatchObject({ status: 'done' });
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe('');
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('2');
  });

  it('ошибка без retry (нет запроса, ответ не принят) шаг не откладывает; устаревшая запись места не держит', async () => {
    const { db, settings } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    // Запись о шаге, которого в плане уже нет (план сократили).
    settings.set(OFFICE_SETTINGS.stepRetry, '57:0:0123456789abcdef');
    const first = await peek(db);
    expect(first.index).toBe(0);
    const outcome = await ingestScheduledStep(
      { index: first.index, key: first.key, error: 'Для шага плана нет запроса Overpass' },
      { db },
    );
    expect(outcome).toMatchObject({ status: 'done' });
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe('');
  });

  it('отложенная запись привязана к шагу: после правки плана тот же номер — другой шаг, запись не действует', async () => {
    const { db, settings, clock } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN3);
    const at = () => new Date(clock.now);
    const first = await peek(db, at());
    await fail(db, first, at());
    // Владелец поменял план: под номером 0 теперь другой город.
    settings.set(
      OFFICE_SETTINGS.plan,
      'sites; dentist; Уфа\nproviders; machinery; Уфа\nsites; beauty; Казань',
    );
    await ok(db, await peek(db, at()));
    // Свежий успех есть, но отложенная запись — о прежнем шаге 0: отдаётся шаг под курсором.
    const next = await peek(db, at());
    expect(next.index).toBe(2);
    await ok(db, next);
    expect(settings.get(OFFICE_SETTINGS.stepRetry)).toBe('');
  });

  it('спецтехника: запрос без фильтра по названию; в Москве и Петербурге — только узкие теги', () => {
    const kazan = relayRequest({ agent: 'providers', niche: 'machinery', city: 'Казань' }).query!;
    expect(kazan).toContain('nwr["office"="company"](around:15000,');
    expect(kazan).toContain('nwr["craft"](around:15000,');
    expect(kazan).toContain('nwr["shop"="rental"](around:15000,');
    // Зеркала Overpass на фильтре по названию не успевают никогда — названия отбирает приложение.
    expect(kazan).not.toContain('"name"');
    for (const city of ['Москва', 'Санкт-Петербург']) {
      const big = relayRequest({ agent: 'providers', niche: 'machinery', city }).query!;
      expect(big).toContain('nwr["shop"="rental"](around:15000,');
      expect(big).toContain('nwr["shop"="truck"](around:15000,');
      expect(big).not.toContain('office');
      expect(big).not.toContain('craft');
    }
    // Ниши без отбора по названию в крупных городах не урезаются.
    const beauty = relayRequest({ agent: 'sites', niche: 'beauty', city: 'Москва' }).query!;
    expect(beauty).toContain('(around:15000,');
    expect(beauty.split('nwr[').length).toBeGreaterThan(1);
  });

  it('ниши площадки с отбором по названию: в Москве и Петербурге без office=company', () => {
    const omsk = relayRequest({
      agent: 'providers',
      niche: 'road_construction',
      city: 'Омск',
    }).query!;
    expect(omsk).toContain('nwr["office"="construction_company"](around:15000,');
    expect(omsk).toContain('nwr["office"="company"](around:15000,');
    expect(omsk).not.toContain('"name"');
    const moscow = relayRequest({ agent: 'providers', niche: 'estimators', city: 'Москва' }).query!;
    expect(moscow).toContain('nwr["office"="consulting"](around:15000,');
    expect(moscow).toContain('nwr["office"="engineer"](around:15000,');
    expect(moscow).not.toContain('"office"="company"');
    // Точные теги без отбора по названию идут как есть.
    const freight = relayRequest({ agent: 'providers', niche: 'freight', city: 'Москва' }).query!;
    expect(freight).toContain('nwr["office"="logistics"](around:15000,');
    expect(freight).toContain('nwr["office"="moving_company"](around:15000,');
  });

  it('эпоха плана: курсор прежней эпохи не действует, обход с первого шага; запись ставит эпоху', async () => {
    const { db, settings } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    settings.set(OFFICE_SETTINGS.cursor, '1');
    // Курсор «1» записан до смены эпохи (без office.planEpoch) — начинаем с шага 0.
    const first = await peekScheduledStep(db);
    expect(first).toMatchObject({ index: 0, step: { city: 'Казань' } });
    if ('skipped' in first) throw new Error('шаг ожидался');
    await ingestScheduledStep({ index: 0, key: first.key, overpass }, { db });
    expect(settings.get(OFFICE_SETTINGS.planEpoch)).toBe(PLAN_EPOCH);
    expect(settings.get(OFFICE_SETTINGS.cursor)).toBe('1');
    // В той же эпохе курсор действует как записан.
    expect(await peekScheduledStep(db)).toMatchObject({ index: 1, step: { city: 'Уфа' } });
  });

  it('через раннер за шаг создаётся до RELAY_STEP_LIMIT кандидатов, а не десять', async () => {
    const { db, settings, prospects } = fakeDb();
    settings.set(OFFICE_SETTINGS.plan, PLAN);
    const many = {
      elements: Array.from({ length: 45 }, (_, i) =>
        el(100 + i, { name: `Клиника ${i}`, phone: `+7 843 300-${String(i).padStart(2, '0')}-00` }),
      ),
    };
    const first = await peekScheduledStep(db);
    if ('skipped' in first) throw new Error('шаг ожидался');
    const done = await ingestScheduledStep({ index: 0, key: first.key, overpass: many }, { db });
    expect(done.status === 'done' && done.result.created).toBe(RELAY_STEP_LIMIT);
    expect(prospects).toHaveLength(RELAY_STEP_LIMIT);
    expect(RELAY_STEP_LIMIT).toBeGreaterThan(STEP_LIMIT);
  });

  it('запрос для раннера: Overpass по нише и городу шага; неизвестный город — без запроса', () => {
    const { query, mirrors } = relayRequest({ agent: 'sites', niche: 'dentist', city: 'Казань' });
    expect(query).toContain('"amenity"="dentist"');
    expect(query).toContain('around:15000');
    expect(mirrors).toHaveLength(2);
    expect(relayRequest({ agent: 'sites', niche: 'dentist', city: 'Нигде' }).query).toBeNull();
  });

  it('на сервере Overpass не спрашивается', () => {
    expect(defaultSource().id).not.toContain('osm');
  });
});

describe('phoneTail', () => {
  it('последние 10 цифр', () => {
    expect(phoneTail('+7 (843) 200-11-22')).toBe('8432001122');
    expect(phoneTail('88432001122')).toBe('8432001122');
  });
});

describe('правило «есть сайт — не кандидат» — только у «Сайтов»', () => {
  const list = () => [
    candidate({ name: 'ТрансЛогистик', sourceRef: 'osm:node/1', phone: '+78432000001' }),
    candidate({
      name: 'Грузовая компания «Рейс»',
      sourceRef: 'osm:node/2',
      phone: '+78432000002',
      website: 'https://reis.example',
    }),
  ];

  it('websiteIsFine: фирма с сайтом не кандидат ни для одного проекта (владелец, 2026-11-13)', () => {
    expect(websiteIsFine('sites')).toBe(false);
    expect(websiteIsFine('providers')).toBe(false);
    expect(sourceNiche(nicheByKey('freight')!).websiteOk).toBeUndefined();
    expect(sourceNiche(nicheByKey('car_repair')!).websiteOk).toBeUndefined();
  });

  it('проект площадки: фирма с сайтом мимо, без сайта — кандидат', async () => {
    const { db, prospects } = fakeDb();
    const result = await runStep(
      { agent: 'providers', niche: 'freight', city: 'Омск', trigger: 'cron' },
      { db, source: source(ok(list())) },
    );
    expect(result).toMatchObject({ found: 2, created: 1, error: null });
    expect(prospects.map((p) => p.sourceRef)).toEqual(['osm:node/1']);
  });

  it('«Сайты»: те же фирмы — с сайтом мимо, как раньше', async () => {
    const { db, prospects } = fakeDb();
    const result = await runStep(
      { agent: 'sites', niche: 'car_repair', city: 'Омск', trigger: 'cron' },
      { db, source: source(ok(list())) },
    );
    expect(result).toMatchObject({ found: 2, created: 1, skipped: 1 });
    expect(prospects.map((p) => p.sourceRef)).toEqual(['osm:node/1']);
  });

  it('ИП и люди не становятся кандидатами и в проекте площадки', async () => {
    const { db, prospects } = fakeDb();
    const result = await runStep(
      { agent: 'providers', niche: 'freight', city: 'Омск', trigger: 'cron' },
      {
        db,
        source: source(ok([candidate({ name: 'ИП Иванов', website: 'https://ivanov.example' })])),
      },
    );
    expect(result).toMatchObject({ found: 1, created: 0, skipped: 1 });
    expect(prospects).toHaveLength(0);
  });
});
