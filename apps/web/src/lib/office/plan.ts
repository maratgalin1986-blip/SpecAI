// Офис агентов: план обхода городов и ниш (spec §2). План хранится в AppSetting строками
// «агент; ниша; город»; шаг берётся по кругу от курсора.

import { RUSSIAN_CITIES, cityByName } from '@specai/shared';
import { AGENTS, agentById } from './agents';
import { nicheByKey, nichesOf } from './niches';
import type { AgentId, PlanStep } from './types';

/** Ключи AppSetting офиса. */
export const OFFICE_SETTINGS = {
  plan: 'office.plan',
  cursor: 'office.cursor',
  planEpoch: 'office.planEpoch',
  paused: 'office.paused',
  sitePrice: 'office.sitePrice',
  siteMonthly: 'office.siteMonthly',
  outreachPaused: 'office.outreachPaused',
  dailyCap: 'office.dailyCap',
  replyTo: 'office.replyTo',
} as const;

/** Регион, который офис обходит целиком и первым (владелец, 2026-11-09: «возьми весь Татарстан»). */
export const HOME_REGION = 'Республика Татарстан';

/** Сколько городов из RUSSIAN_CITIES обходит агент «Подрядчики» после домашнего региона. */
export const DEFAULT_PROVIDER_CITIES = 30;

/** Города агента «Сайты» за пределами домашнего региона в плане по умолчанию. */
export const DEFAULT_SITE_CITIES: readonly string[] = ['Уфа', 'Самара', 'Пермь', 'Екатеринбург'];

/** Все города домашнего региона из списка городов России, крупные первыми. */
export function homeRegionCities(): string[] {
  return RUSSIAN_CITIES.filter((city) => city.region === HOME_REGION).map((city) => city.name);
}

/**
 * Сначала весь Татарстан (оба агента, каждый его город), затем остальная Россия:
 * providers × machinery по первым 30 городам и sites × ниши × 4 города; агенты
 * идут так: один шаг providers, три шага sites. Когда один список кончается, идёт
 * остаток другого.
 */
export function defaultPlan(): PlanStep[] {
  const home = homeRegionCities();
  const providerCities = [
    ...home,
    ...RUSSIAN_CITIES.slice(0, DEFAULT_PROVIDER_CITIES)
      .map((city) => city.name)
      .filter((name) => !home.includes(name)),
  ];
  const providers: PlanStep[] = providerCities.flatMap((city) =>
    AGENTS.providers.defaultNiches.map((niche) => ({ agent: 'providers' as const, niche, city })),
  );
  const sites: PlanStep[] = [];
  for (const cityName of [...home, ...DEFAULT_SITE_CITIES]) {
    const city = cityByName(cityName);
    if (!city) continue;
    for (const niche of AGENTS.sites.defaultNiches) {
      sites.push({ agent: 'sites', niche, city: city.name });
    }
  }
  return interleave(providers, sites);
}

/** Сколько шагов «Сайтов» идёт на один шаг «Подрядчиков» в плане по умолчанию. */
export const SITES_PER_PROVIDER_STEP = 3;

/**
 * Один шаг `a`, затем SITES_PER_PROVIDER_STEP шагов `b`. Владельцу нужны прежде всего сайты
 * (2026-11-09: «интересует направление: создание сайтов»), а открытые карты по спецтехнике почти
 * ничего не дают — при чередовании один к одному половина шагов уходила впустую.
 */
function interleave(a: PlanStep[], b: PlanStep[]): PlanStep[] {
  const out: PlanStep[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length) out.push(a[i++]!);
    for (let k = 0; k < SITES_PER_PROVIDER_STEP && j < b.length; k++) out.push(b[j++]!);
  }
  return out;
}

/** Строки «агент; ниша; город». */
export function formatPlan(steps: readonly PlanStep[]): string {
  return steps.map((s) => `${s.agent}; ${s.niche}; ${s.city}`).join('\n');
}

/**
 * Разбор плана из текста. Пустые строки и строки с `#` пропускаются; у каждой ошибки —
 * номер строки. Неизвестный агент, ниша не того агента или город не из списка — строка
 * пропускается с ошибкой, остальные шаги остаются.
 */
export function parsePlan(text: string): { steps: PlanStep[]; errors: string[] } {
  const steps: PlanStep[] = [];
  const errors: string[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const n = i + 1;
    const parts = line.split(';').map((p) => p.trim());
    const [agentRaw, nicheRaw, cityRaw] = parts;
    if (parts.length < 3 || !agentRaw || !nicheRaw || !cityRaw) {
      errors.push(`Строка ${n}: нужно три поля через «;» — агент; ниша; город`);
      return;
    }
    const agent = agentById(agentRaw.toLowerCase());
    if (!agent) {
      errors.push(
        `Строка ${n}: неизвестный агент «${agentRaw}» (допустимо: ${Object.keys(AGENTS).join(', ')})`,
      );
      return;
    }
    const niche = nicheByKey(nicheRaw.toLowerCase());
    if (!niche) {
      errors.push(`Строка ${n}: неизвестная ниша «${nicheRaw}»`);
      return;
    }
    if (niche.agent !== agent.id) {
      const allowed = nichesOf(agent.id as AgentId)
        .map((x) => x.key)
        .join(', ');
      errors.push(
        `Строка ${n}: ниша «${niche.key}» не у агента «${agent.name}» (допустимо: ${allowed})`,
      );
      return;
    }
    const city = cityByName(cityRaw);
    if (!city) {
      errors.push(`Строка ${n}: город «${cityRaw}» не найден в списке городов`);
      return;
    }
    steps.push({ agent: agent.id, niche: niche.key, city: city.name });
  });
  return { steps, errors };
}

/** Шаг по курсору по кругу; пустой план → null и курсор 0. */
export function nextStep(
  steps: readonly PlanStep[],
  cursor: number,
): { step: PlanStep | null; nextCursor: number } {
  if (steps.length === 0) return { step: null, nextCursor: 0 };
  const raw = Number.isFinite(cursor) ? Math.trunc(cursor) : 0;
  const index = ((raw % steps.length) + steps.length) % steps.length;
  return { step: steps[index] ?? null, nextCursor: (index + 1) % steps.length };
}
