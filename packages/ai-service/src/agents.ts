import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_PROFILES, type AgentId } from '@specai/shared';
import { getAnthropicClient, DEFAULT_MODEL } from './client';

// ---------------------------------------------------------------------------
// Tools
//
// The agents' tools are declared here, but executed by the caller (apps/web),
// which owns database access and the signed-in user's session. This keeps the
// AI package free of Prisma and auth concerns.
// ---------------------------------------------------------------------------

export type AgentToolName =
  | 'list_categories'
  | 'search_equipment'
  | 'get_equipment_details'
  | 'estimate_rental_cost'
  | 'create_order'
  | 'get_my_bookings'
  | 'get_my_orders'
  | 'list_open_orders'
  | 'get_my_fleet';

export type AgentToolHandlers = Record<
  AgentToolName,
  (input: Record<string, unknown>) => Promise<unknown>
>;

const TOOLS: Record<AgentToolName, Anthropic.Tool> = {
  list_categories: {
    name: 'list_categories',
    description: 'Returns all equipment categories (id and name) available in the catalog.',
    input_schema: { type: 'object', properties: {} },
  },
  search_equipment: {
    name: 'search_equipment',
    description:
      'Searches the equipment catalog. Returns up to 10 listings with id, name, category, ' +
      'city, daily rate and status. All filters are optional.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search over name, make and model.' },
        categoryId: { type: 'string', description: 'Category id from list_categories.' },
        city: { type: 'string' },
        maxDailyRate: { type: 'number' },
        onlyAvailable: { type: 'boolean', description: 'Defaults to true.' },
      },
    },
  },
  get_equipment_details: {
    name: 'get_equipment_details',
    description:
      'Returns full details of one equipment listing: specs, rates, rating and ' +
      'a link to its page.',
    input_schema: {
      type: 'object',
      properties: { equipmentId: { type: 'string' } },
      required: ['equipmentId'],
    },
  },
  estimate_rental_cost: {
    name: 'estimate_rental_cost',
    description:
      'Computes the rental cost of a listing for a number of days using its daily, weekly ' +
      'and monthly rates (whichever is cheapest).',
    input_schema: {
      type: 'object',
      properties: {
        equipmentId: { type: 'string' },
        days: { type: 'integer', minimum: 1, maximum: 365 },
      },
      required: ['equipmentId', 'days'],
    },
  },
  create_order: {
    name: 'create_order',
    description:
      'Creates a job order on behalf of the signed-in customer; СпецПласт16 then replies ' +
      'with its price. Only call after the user has confirmed the description and dates.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'What needs to be done, in Russian, including location and volume.',
        },
        desiredStartDate: { type: 'string', description: 'ISO date, YYYY-MM-DD.' },
        desiredEndDate: { type: 'string', description: 'ISO date, YYYY-MM-DD.' },
        categoryId: { type: 'string', description: 'Optional category id.' },
      },
      required: ['description', 'desiredStartDate', 'desiredEndDate'],
    },
  },
  get_my_bookings: {
    name: 'get_my_bookings',
    description: "Returns the signed-in user's bookings with status, dates and price.",
    input_schema: { type: 'object', properties: {} },
  },
  get_my_orders: {
    name: 'get_my_orders',
    description: "Returns the signed-in user's job orders with status and number of price offers.",
    input_schema: { type: 'object', properties: {} },
  },
  list_open_orders: {
    name: 'list_open_orders',
    description: 'Returns open customer job orders waiting for a price from СпецПласт16.',
    input_schema: {
      type: 'object',
      properties: { categoryId: { type: 'string' } },
    },
  },
  get_my_fleet: {
    name: 'get_my_fleet',
    description:
      "Returns СпецПласт16's own fleet with status and count of pending bookings (owner only).",
    input_schema: { type: 'object', properties: {} },
  },
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const COMPANY_CONTEXT =
  'You work for СпецПласт16 (ООО «СПЕЦПЛАСТ 16», Naberezhnye Chelny) — a special-equipment ' +
  'rental and construction services ' +
  'company in the Republic of Tatarstan (region 16). СпецПласт16 is the only executor: its own ' +
  'machines and its own operators, no intermediaries or third-party providers. Customers rent ' +
  'excavators, cranes, loaders, dump trucks and other machinery by booking a catalog listing ' +
  'or by leaving a job order that СпецПласт16 answers with its price. ' +
  'Always answer in Russian, concisely and politely. Prices are in the listing currency; ' +
  'hourlyRate is per machine-hour with an operator (quote it when present), dailyRate is an ' +
  '8-hour shift. ' +
  'Base every fact about equipment, prices, bookings and orders on tool results only — ' +
  'never invent listings, ids or prices. When you mention a listing, include its link. ' +
  'If a tool says the user must sign in, tell them to sign in at /login.';

interface AgentDefinition {
  system: string;
  tools: AgentToolName[];
}

const AGENTS: Record<AgentId, AgentDefinition> = {
  consultant: {
    system:
      "You are the equipment consultant. Understand the customer's job (soil, volume, " +
      'height, weight, deadline), search the catalog, recommend 1–3 best-fitting options ' +
      'with a one-line reason each, and estimate the cost when dates are known. Ask one ' +
      'clarifying question if the job is too vague to choose equipment.',
    tools: ['list_categories', 'search_equipment', 'get_equipment_details', 'estimate_rental_cost'],
  },
  dispatcher: {
    system:
      "You are the dispatcher. Your goal is to turn the customer's request into a job " +
      'order. Collect: what work is needed, the location, the start and end dates. Pick a ' +
      'category via list_categories when it is clear. Summarize the order and ask for ' +
      'confirmation before calling create_order. After creating it, give the order link.',
    tools: ['list_categories', 'search_equipment', 'create_order'],
  },
  support: {
    system:
      "You are customer support. Answer questions about the user's bookings and orders " +
      'using the tools, and explain how the platform works: bookings go PENDING → ' +
      'CONFIRMED → ACTIVE → COMPLETED; a customer can cancel a pending or confirmed ' +
      'booking from /dashboard; after completion they can leave a review; orders collect ' +
      'a price offer from СпецПласт16 and the customer accepts it on the order page. If you cannot ' +
      'resolve something, suggest contacting a manager via the contacts on the home page.',
    tools: ['get_my_bookings', 'get_my_orders'],
  },
  provider: {
    system:
      'You assist the owner of СпецПласт16 with the company fleet. Show open customer orders, ' +
      'match them against the fleet, point out which orders to quote first and link to them, ' +
      'and summarize fleet status and pending bookings. Fleet management happens at /provider.',
    tools: ['list_open_orders', 'get_my_fleet', 'list_categories'],
  },
};

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentReply {
  agentId: AgentId;
  reply: string;
  toolsUsed: AgentToolName[];
}

const MAX_TOOL_ROUNDS = 6;

/**
 * Runs one agent turn: sends the conversation to Claude with the agent's
 * tools, executes any tool calls via `handlers`, and loops until the model
 * produces a final answer (or the round limit is reached).
 */
export async function runAgent(
  agentId: AgentId,
  history: AgentChatMessage[],
  handlers: AgentToolHandlers,
  context: { today: string; userDescription: string },
): Promise<AgentReply> {
  const client = getAnthropicClient();
  const agent = AGENTS[agentId];
  const profile = AGENT_PROFILES.find((p) => p.id === agentId);

  const system =
    `${COMPANY_CONTEXT}\n\nYour role: ${profile?.name} (${profile?.role}). ${agent.system}\n\n` +
    `Today is ${context.today}. Current user: ${context.userDescription}.`;

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: AgentToolName[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system,
      tools: agent.tools.map((name) => TOOLS[name]),
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      return { agentId, reply: extractText(response.content), toolsUsed };
    }

    // Echo the full assistant content back (including any thinking blocks,
    // which must be passed through unchanged).
    messages.push({
      role: 'assistant',
      content: response.content as Anthropic.MessageParam['content'],
    });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    const results = await Promise.all(
      toolUses.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
        const name = toolUse.name as AgentToolName;
        if (!agent.tools.includes(name)) {
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Unknown tool: ${toolUse.name}`,
            is_error: true,
          };
        }
        toolsUsed.push(name);
        try {
          const output = await handlers[name]((toolUse.input ?? {}) as Record<string, unknown>);
          return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(output) };
        } catch (error) {
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: error instanceof Error ? error.message : 'Tool failed',
            is_error: true,
          };
        }
      }),
    );
    // All tool results go back in a single user message.
    messages.push({ role: 'user', content: results });
  }

  return {
    agentId,
    reply: 'Не удалось завершить запрос за отведённое число шагов. Попробуйте уточнить вопрос.',
    toolsUsed,
  };
}

const ROUTER_TOOL: Anthropic.Tool = {
  name: 'route',
  description: 'Choose which specialist agent should handle the conversation.',
  input_schema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', enum: AGENT_PROFILES.map((p) => p.id) },
    },
    required: ['agentId'],
  },
};

/**
 * Picks the best agent for the conversation's latest message. Falls back to
 * the consultant if the model returns anything unexpected.
 */
export async function routeToAgent(history: AgentChatMessage[]): Promise<AgentId> {
  const client = getAnthropicClient();
  const roster = AGENT_PROFILES.map((p) => `- ${p.id}: ${p.role}. ${p.description}`).join('\n');
  const transcript = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Клиент' : 'Агент'}: ${m.content}`)
    .join('\n');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system:
      'You route messages on an equipment rental website to one specialist agent:\n' +
      roster +
      '\nPick the agent best suited to the latest client message.',
    tools: [ROUTER_TOOL],
    tool_choice: { type: 'tool', name: ROUTER_TOOL.name },
    messages: [{ role: 'user', content: transcript }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  const picked =
    toolUse && toolUse.type === 'tool_use'
      ? (toolUse.input as { agentId?: string }).agentId
      : undefined;
  return AGENT_PROFILES.find((p) => p.id === picked)?.id ?? 'consultant';
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
