import { cityByName } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import { AGENTS, MEDICAL_NICHES } from './agents';
import { defaultPlan, formatPlan, homeRegionCities, nextStep, parsePlan } from './plan';

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

  it('alternates the agents: providers, sites, providers, …', () => {
    expect(plan.slice(0, 4).map((s) => s.agent)).toEqual([
      'providers',
      'sites',
      'providers',
      'sites',
    ]);
  });

  it('весь Татарстан идёт первым у обоих агентов, потом остальная Россия', () => {
    expect(home.length).toBeGreaterThanOrEqual(18);
    expect(home).toContain('Казань');
    expect(home).toContain('Набережные Челны');
    expect(home).toContain('Арск');
    const providerCities = plan.filter((s) => s.agent === 'providers').map((s) => s.city);
    expect(providerCities.slice(0, home.length)).toEqual(home);
    // Остальные 30 крупных городов без повторов Татарстана.
    expect(new Set(providerCities).size).toBe(providerCities.length);
    expect(providerCities).toContain('Москва');
    const siteCities = [...new Set(plan.filter((s) => s.agent === 'sites').map((s) => s.city))];
    expect(siteCities.slice(0, home.length)).toEqual(home);
    expect(siteCities).toContain('Уфа');
    // 5 ниш на каждый город «Сайтов».
    // По каждой нише агента «Сайты» на каждый город.
    expect(plan.filter((s) => s.agent === 'sites')).toHaveLength(
      (home.length + 4) * AGENTS.sites.defaultNiches.length,
    );
    for (const step of plan) expect(cityByName(step.city)?.name).toBe(step.city);
  });
  it('К5: медицинских ниш в плане по умолчанию нет, в ручной строке ниша работает', () => {
    expect(MEDICAL_NICHES).toContain('dentist');
    for (const step of plan) expect(MEDICAL_NICHES).not.toContain(step.niche);
    expect(parsePlan('sites; dentist; Казань').steps).toEqual([
      { agent: 'sites', niche: 'dentist', city: 'Казань' },
    ]);
  });
});
