import { RUSSIAN_CITIES, cityByName } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import { defaultPlan, formatPlan, nextStep, parsePlan } from './plan';

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

  it('alternates the agents: providers, sites, providers, …', () => {
    expect(plan.slice(0, 4).map((s) => s.agent)).toEqual([
      'providers',
      'sites',
      'providers',
      'sites',
    ]);
    expect(plan.filter((s) => s.agent === 'providers')).toHaveLength(30);
    // 5 ниш × 8 городов.
    expect(plan.filter((s) => s.agent === 'sites')).toHaveLength(40);
  });

  it('covers the first 30 cities for providers and known cities only', () => {
    const providerCities = plan.filter((s) => s.agent === 'providers').map((s) => s.city);
    expect(providerCities).toEqual(RUSSIAN_CITIES.slice(0, 30).map((c) => c.name));
    for (const step of plan) expect(cityByName(step.city)?.name).toBe(step.city);
    expect(plan.some((s) => s.city === 'Набережные Челны' && s.niche === 'dentist')).toBe(true);
  });
});
