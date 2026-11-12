import { z } from 'zod';

// Public metadata about the site's AI agents. Lives in `shared` (not
// `ai-service`) so client components can render the agent picker without
// pulling the Anthropic SDK into the browser bundle.
export const agentIdSchema = z.enum(['consultant', 'dispatcher', 'support', 'provider']);
export type AgentId = z.infer<typeof agentIdSchema>;

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  greeting: string;
  suggestions: string[];
  /** Works only for the owner's fleet account; hidden from the public picker. */
  ownerOnly?: boolean;
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'consultant',
    name: 'Консультант',
    role: 'Подбор техники',
    description:
      'Подскажет технику под вашу задачу и покажет цены из каталога — с машинистом, за час и за смену.',
    greeting:
      'Здравствуйте! Я консультант ИИСтройка24. Опишите задачу — подскажу технику и цены из каталога.',
    suggestions: [
      'Нужно вырыть котлован под фундамент 10×12 м',
      'Какие краны есть в наличии?',
      'Сколько будет стоить экскаватор на 5 дней?',
    ],
  },
  {
    id: 'dispatcher',
    // Not «Диспетчер»: that word is kept for the person who calls back.
    name: 'Приём заявок',
    role: 'Заявка в любое время',
    description:
      'Примет заявку в любое время: напишите, что нужно, и оставьте телефон — диспетчер перезвонит в рабочие часы.',
    greeting:
      'Принимаю заявки ИИСтройка24. Расскажите, что нужно сделать и когда, и оставьте телефон — диспетчер перезвонит в рабочие часы.',
    suggestions: [
      'Оформи заявку на автокран с 1 по 5 число',
      'Нужен самосвал на неделю для вывоза грунта',
    ],
  },
  {
    id: 'support',
    name: 'Поддержка',
    role: 'Статус аренды и вопросы',
    description:
      'Подскажет статус ваших бронирований и заявок, ответит на вопросы об условиях аренды.',
    greeting:
      'Служба поддержки ИИСтройка24 на связи. Спросите о своих бронированиях, заявках или условиях аренды.',
    suggestions: ['Какой статус у моих бронирований?', 'Как отменить бронирование?'],
  },
  {
    id: 'provider',
    name: 'Помощник владельца',
    role: 'Парк СпецПласт16',
    description:
      'Покажет открытые заявки клиентов и загрузку парка СпецПласт16, подскажет, кому ответить первым.',
    greeting: 'Я помогаю владельцу СпецПласт16. Покажу открытые заявки и загрузку парка.',
    suggestions: ['Какие есть открытые заявки?', 'Покажи технику и её статус'],
    ownerOnly: true,
  },
];

/** Agents offered to site visitors. */
export const PUBLIC_AGENT_PROFILES = AGENT_PROFILES.filter((profile) => !profile.ownerOnly);

export const agentChatRequestSchema = z.object({
  // 'auto' lets the router pick the best agent for the latest message.
  agentId: z.union([agentIdSchema, z.literal('auto')]),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
  // The visitor ticked the personal-data consent box: a phone number in the
  // latest message is saved as a callback request only when this is true.
  consent: z.boolean().optional(),
});
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
