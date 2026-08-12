import { z } from 'zod';
import { getAnthropicClient, DEFAULT_MODEL } from './client';

export const equipmentCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  dailyRate: z.number(),
  specs: z.record(z.string(), z.unknown()).optional(),
});
export type EquipmentCandidate = z.infer<typeof equipmentCandidateSchema>;

export const recommendationResultSchema = z.object({
  recommendations: z.array(
    z.object({
      equipmentId: z.string(),
      reason: z.string(),
    }),
  ),
  followUpQuestion: z.string().optional(),
});
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

const RECOMMENDATION_TOOL = {
  name: 'submit_recommendations',
  description: 'Submit the ranked equipment recommendations for the job described by the user.',
  input_schema: {
    type: 'object' as const,
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            equipmentId: { type: 'string' },
            reason: { type: 'string', description: 'One sentence explaining the match.' },
          },
          required: ['equipmentId', 'reason'],
        },
      },
      followUpQuestion: {
        type: 'string',
        description: 'Optional clarifying question if the job requirements are ambiguous.',
      },
    },
    required: ['recommendations'],
  },
};

/**
 * Given a natural-language description of a construction job and a list of
 * candidate equipment already filtered by availability/location, asks Claude
 * to rank the best matches with a short rationale for each.
 */
export async function recommendEquipment(
  jobDescription: string,
  candidates: EquipmentCandidate[],
): Promise<RecommendationResult> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system:
      'You are an equipment rental assistant for a heavy equipment and construction ' +
      'services marketplace. Recommend the best-fitting equipment for the described job ' +
      'from the provided candidate list only. Never invent equipment ids. ' +
      'Write the "reason" and "followUpQuestion" fields in Russian.',
    tools: [RECOMMENDATION_TOOL],
    tool_choice: { type: 'tool', name: RECOMMENDATION_TOOL.name },
    messages: [
      {
        role: 'user',
        content: `Job description:\n${jobDescription}\n\nCandidate equipment (JSON):\n${JSON.stringify(
          candidates,
        )}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a tool_use block');
  }

  return recommendationResultSchema.parse(toolUse.input);
}
