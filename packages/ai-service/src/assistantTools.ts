import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * Tool definitions (JSON Schema) for the customer assistant.
 *
 * Only the schemas live here: the ai-service package has no database access,
 * so the actual implementations are supplied by the caller (apps/web) through
 * `onToolCall` in `streamAssistantReply`.
 */

export const SEARCH_EQUIPMENT_TOOL_NAME = 'search_equipment';
export const GET_MY_BOOKINGS_TOOL_NAME = 'get_my_bookings';

export type AssistantToolName =
  typeof SEARCH_EQUIPMENT_TOOL_NAME | typeof GET_MY_BOOKINGS_TOOL_NAME;

export const searchEquipmentInputSchema = z.object({
  query: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  maxDailyRate: z.number().nonnegative().optional(),
});
export type SearchEquipmentInput = z.infer<typeof searchEquipmentInputSchema>;

export const getMyBookingsInputSchema = z.object({});
export type GetMyBookingsInput = z.infer<typeof getMyBookingsInputSchema>;

export const SEARCH_EQUIPMENT_TOOL: Anthropic.Tool = {
  name: SEARCH_EQUIPMENT_TOOL_NAME,
  description:
    'Search the СпецПласт16 catalogue for heavy equipment that is currently available for rent. ' +
    'Returns up to 5 matching units with id, name, category, city and daily rate. ' +
    'Use it whenever the user asks to find, pick or compare equipment. ' +
    'All filters are optional; combine them to narrow the search.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Free-text search over equipment name, make, model and description (Russian or English).',
      },
      category: {
        type: 'string',
        description: 'Equipment category name or slug, e.g. "Экскаваторы" or "excavators".',
      },
      city: {
        type: 'string',
        description: 'City where the equipment is located.',
      },
      maxDailyRate: {
        type: 'number',
        description: 'Maximum daily rental rate the user is willing to pay.',
      },
    },
    additionalProperties: false,
  },
};

export const GET_MY_BOOKINGS_TOOL: Anthropic.Tool = {
  name: GET_MY_BOOKINGS_TOOL_NAME,
  description:
    "Return the current user's equipment bookings (status, dates, equipment name, total price). " +
    'Use it whenever the user asks about their bookings, orders, rental dates or payments.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [SEARCH_EQUIPMENT_TOOL, GET_MY_BOOKINGS_TOOL];

const inputSchemasByTool: Record<AssistantToolName, z.ZodTypeAny> = {
  [SEARCH_EQUIPMENT_TOOL_NAME]: searchEquipmentInputSchema,
  [GET_MY_BOOKINGS_TOOL_NAME]: getMyBookingsInputSchema,
};

/**
 * Validates a raw tool input from the model against the tool's schema.
 * Returns the parsed input, or a zod error for unknown tools/invalid input.
 */
export function parseAssistantToolInput(
  name: string,
  input: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = inputSchemasByTool[name as AssistantToolName];
  if (!schema) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}
