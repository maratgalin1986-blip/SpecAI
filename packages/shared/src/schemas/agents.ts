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
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'consultant',
    name: 'Консультант',
    role: 'Подбор техники',
    description:
      'Разберётся в задаче, найдёт подходящую технику в каталоге и посчитает стоимость аренды.',
    greeting:
      'Здравствуйте! Я консультант СпецПласт16. Опишите задачу — подберу технику и посчитаю стоимость.',
    suggestions: [
      'Нужно вырыть котлован под фундамент 10×12 м',
      'Какие краны есть в наличии?',
      'Сколько будет стоить экскаватор на 5 дней?',
    ],
  },
  {
    id: 'dispatcher',
    name: 'Диспетчер',
    role: 'Оформление заявок',
    description:
      'Соберёт детали работ и сроки, а затем оформит заявку, на которую откликнутся поставщики.',
    greeting:
      'Я диспетчер СпецПласт16. Расскажите, что нужно сделать и когда, — оформлю заявку за вас.',
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
      'Служба поддержки СпецПласт16 на связи. Спросите о своих бронированиях, заявках или условиях аренды.',
    suggestions: ['Какой статус у моих бронирований?', 'Как отменить бронирование?'],
  },
  {
    id: 'provider',
    name: 'Помощник поставщика',
    role: 'Для владельцев техники',
    description:
      'Покажет открытые заявки клиентов, состояние вашего парка и подскажет, где сделать ставку.',
    greeting: 'Я помогаю поставщикам техники. Покажу открытые заявки и загрузку вашего парка.',
    suggestions: ['Какие есть открытые заявки?', 'Покажи мою технику и её статус'],
  },
];

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
});
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
