import { RUSSIAN_CITIES, cityByName } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import { AGENTS, MEDICAL_NICHES } from './agents';
import {
  EAST_SITE_CITIES,
  defaultPlan,
  formatPlan,
  homeRegionCities,
  nextStep,
  parsePlan,
} from './plan';

describe('office plan: parsePlan', () => {
  it('reads «agent; niche; city» lines and reports errors by line number', () => {
    const { steps, errors } = parsePlan(
      [
        'providers; machinery; Казань',
        '',
        '# комментарий',
        'robots; machinery; Казань',
        'sites; unknown; Казань',
        'sites; machinery; Казань',
        'sites; dentist; Нигде',
        'sites; dentist',
        'SITES; Dentist; набережные челны',
      ].join('\n'),
    );
    expect(steps).toEqual([
      { agent: 'providers', niche: 'machinery', city: 'Казань' },
      { agent: 'sites', niche: 'dentist', city: 'Набережные Челны' },
    ]);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toMatch(/^Строка 4: неизвестный агент «robots»/);
    expect(errors[1]).toMatch(/^Строка 5: неизвестная ниша «unknown»/);
    expect(errors[2]).toMatch(/^Строка 6: ниша «machinery» не у агента «Сайты под ключ»/);
    expect(errors[3]).toMatch(/^Строка 7: город «Нигде» не найден/);
    expect(errors[4]).toMatch(/^Строка 8: нужно три поля/);
  });

  it('round-trips through formatPlan', () => {
    const plan = defaultPlan();
    expect(parsePlan(formatPlan(plan))).toEqual({ steps: plan, errors: [] });
  });
});

describe('office plan: nextStep', () => {
  const steps = parsePlan(
    'providers; machinery; Казань\nsites; vet; Уфа\nsites; tyres; Пермь',
  ).steps;

  it('walks the plan in a circle', () => {
    expect(nextStep(steps, 0)).toEqual({ step: steps[0], nextCursor: 1 });
    expect(nextStep(steps, 2)).toEqual({ step: steps[2], nextCursor: 0 });
    expect(nextStep(steps, 3)).toEqual({ step: steps[0], nextCursor: 1 });
    expect(nextStep(steps, -1)).toEqual({ step: steps[2], nextCursor: 0 });
    expect(nextStep(steps, Number.NaN)).toEqual({ step: steps[0], nextCursor: 1 });
  });

  it('returns null for an empty plan', () => {
    expect(nextStep([], 5)).toEqual({ step: null, nextCursor: 0 });
  });
});

describe('office plan: defaultPlan', () => {
  const plan = defaultPlan();
  const home = homeRegionCities();
  const eastCount = EAST_SITE_CITIES.length * AGENTS.sites.defaultNiches.length;
  const east = plan.slice(0, eastCount);
  const rest = plan.slice(eastCount);

  it('one providers step, then three sites steps: sites are what the owner wants first', () => {
    expect(rest.slice(0, 8).map((s) => s.agent)).toEqual([
      'providers',
      'sites',
      'sites',
      'sites',
      'providers',
      'sites',
      'sites',
      'sites',
    ]);
  });

  it('после восточных городов — весь Татарстан у обоих агентов, потом остальная Россия', () => {
    expect(home.length).toBeGreaterThanOrEqual(18);
    expect(home).toContain('Казань');
    expect(home).toContain('Набережные Челны');
    expect(home).toContain('Арск');
    const providerSteps = rest.filter((s) => s.agent === 'providers');
    const providerCities = [...new Set(providerSteps.map((s) => s.city))];
    expect(providerCities.slice(0, home.length)).toEqual(home);
    // Проект площадки — вся Россия: каждый город списка, восточные тоже, каждый один раз.
    expect(providerCities).toHaveLength(RUSSIAN_CITIES.length);
    expect(providerCities).toContain('Москва');
    expect(providerCities).toContain('Владивосток');
    expect(providerSteps).toHaveLength(
      RUSSIAN_CITIES.length * AGENTS.providers.defaultNiches.length,
    );
    const siteCities = [...new Set(rest.filter((s) => s.agent === 'sites').map((s) => s.city))];
    expect(siteCities.slice(0, home.length)).toEqual(home);
    expect(siteCities).toContain('Уфа');
    // 5 ниш на каждый город «Сайтов».
    // По каждой нише агента «Сайты» на каждый город.
    expect(rest.filter((s) => s.agent === 'sites')).toHaveLength(
      // Вся Россия: каждый город списка, кроме восточных (они — в начале плана).
      (RUSSIAN_CITIES.length - EAST_SITE_CITIES.length) * AGENTS.sites.defaultNiches.length,
    );
    for (const step of plan) expect(cityByName(step.city)?.name).toBe(step.city);
  });
  it('«Подрядчики» проходят в городе все свои ниши подряд, и только свои', () => {
    const niches = AGENTS.providers.defaultNiches;
    expect(niches.length).toBeGreaterThan(1);
    const steps = rest.filter((s) => s.agent === 'providers');
    // Первый город — Казань: ниши в порядке агента, дорожники раньше строителей.
    expect(steps.slice(0, niches.length)).toEqual(
      niches.map((niche) => ({ agent: 'providers', niche, city: 'Казань' })),
    );
    expect(niches.indexOf('road_construction')).toBeLessThan(niches.indexOf('construction'));
    for (let i = 0; i < steps.length; i += niches.length) {
      const city = steps.slice(i, i + niches.length);
      expect(new Set(city.map((s) => s.city)).size).toBe(1);
      expect(city.map((s) => s.niche)).toEqual(niches);
    }
  });
  it('чередование один к трём держится, пока есть шаги «Сайтов»; дальше — остаток площадки', () => {
    const lastSite = rest.map((s) => s.agent).lastIndexOf('sites');
    const mixed = rest.slice(0, lastSite + 1);
    // Блоками по четыре: providers, sites, sites, sites — без единого сбоя.
    for (let i = 0; i + 4 <= mixed.length; i += 4) {
      expect(mixed.slice(i, i + 4).map((s) => s.agent)).toEqual([
        'providers',
        'sites',
        'sites',
        'sites',
      ]);
    }
    expect(mixed.length).toBeGreaterThan(400);
    expect(rest.slice(lastSite + 1).every((s) => s.agent === 'providers')).toBe(true);
  });
  it('Дальний Восток — в начале плана: все ниши «Сайтов» по каждому восточному городу', () => {
    expect(east.every((s) => s.agent === 'sites')).toBe(true);
    expect([...new Set(east.map((s) => s.city))]).toEqual([...EAST_SITE_CITIES]);
    expect(east[0]).toMatchObject({ city: 'Владивосток' });
  });
  it('К5: медицинских ниш в плане по умолчанию нет, в ручной строке ниша работает', () => {
    expect(MEDICAL_NICHES).toContain('dentist');
    for (const step of plan) expect(MEDICAL_NICHES).not.toContain(step.niche);
    expect(parsePlan('sites; dentist; Казань').steps).toEqual([
      { agent: 'sites', niche: 'dentist', city: 'Казань' },
    ]);
  });
});
