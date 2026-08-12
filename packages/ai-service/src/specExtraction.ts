import { z } from 'zod';
import { getAnthropicClient, DEFAULT_MODEL } from './client';

export const extractedSpecsSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type ExtractedSpecs = z.infer<typeof extractedSpecsSchema>;

const EXTRACTION_TOOL = {
  name: 'submit_specs',
  description: 'Submit structured equipment specifications extracted from the source text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      make: { type: 'string' },
      model: { type: 'string' },
      year: { type: 'integer' },
      specs: {
        type: 'object',
        description:
          'Key/value technical specs. Keys must be short human-readable Russian labels ' +
          'including the unit, e.g. "Эксплуатационная масса, кг", "Мощность двигателя, л.с.".',
        additionalProperties: { type: ['string', 'number', 'boolean'] },
      },
    },
    required: ['specs'],
  },
};

/**
 * Extracts structured make/model/year/spec data from free-form text such as
 * a manufacturer spec sheet or a provider's listing description, so it can
 * be stored on Equipment.specs and used for search/filtering.
 */
export async function extractEquipmentSpecs(sourceText: string): Promise<ExtractedSpecs> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system:
      'You extract structured heavy equipment specifications from unstructured listing ' +
      'or spec-sheet text. Only include values explicitly present in the source text. ' +
      'Use Russian for spec key labels.',
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
    messages: [{ role: 'user', content: sourceText }],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a tool_use block');
  }

  return extractedSpecsSchema.parse(toolUse.input);
}
