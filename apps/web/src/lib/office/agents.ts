// Офис агентов: два агента с одной механикой и разными словарями (spec §0, §2).

import type { AgentId, ProspectKind } from './types';

export interface Agent {
  id: AgentId;
  name: string;
  kind: ProspectKind;
  description: string;
  /** Ключи ниш из lib/office/niches.ts. */
  defaultNiches: string[];
}

export const AGENTS: Record<AgentId, Agent> = {
  sites: {
    id: 'sites',
    name: 'Сайты под ключ',
    kind: 'site',
    description:
      'Находит на картах компании без сайта — стоматологии, автосервисы, салоны — и готовит каждой страницу-визитку по данным карточки. После согласия компании страница публикуется, компания платит за сайт и поддержку.',
    defaultNiches: ['dentist', 'car_repair', 'tyres', 'beauty', 'vet'],
  },
  providers: {
    id: 'providers',
    name: 'Подрядчики',
    kind: 'provider',
    description:
      'Находит компании спецтехники без сайта и готовит каждой бесплатную страницу исполнителя на площадке с техникой, городом и кнопкой «Заказать». После согласия страница публикуется, а компания по ссылке встаёт на линию.',
    defaultNiches: ['machinery'],
  },
};

export const AGENT_IDS: readonly AgentId[] = ['providers', 'sites'];

export function agentById(id: string | null | undefined): Agent | null {
  if (!id) return null;
  return Object.prototype.hasOwnProperty.call(AGENTS, id) ? AGENTS[id as AgentId] : null;
}
