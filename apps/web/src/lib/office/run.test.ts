import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import { OFFICE_SETTINGS, defaultPlan } from './plan';
import {
  STEP_LIMIT,
  createManualProspects,
  phoneTail,
  resolvePlan,
  runScheduledStep,
  runStep,
  type OfficeDb,
  type ProspectCreateData,
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
    ...p,
  }));
  const companies = (seed.companies ?? []).map((phone, i) => ({ id: `c${i}`, phone }));
  const runs: RunRow[] = [];
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
        };
        runs.push(row);
        return { id: row.id };
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
  return { db, prospects, runs, settings };
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
    expect(calls[0]).toMatchObject({ radiusKm: 15, limit: STEP_LIMIT, city: { name: 'Казань' } });
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

describe('phoneTail', () => {
  it('последние 10 цифр', () => {
    expect(phoneTail('+7 (843) 200-11-22')).toBe('8432001122');
    expect(phoneTail('88432001122')).toBe('8432001122');
  });
});
