import type Anthropic from '@anthropic-ai/sdk';
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

const SYSTEM_PROMPT =
  'You extract structured heavy equipment specifications from unstructured listing ' +
  'or spec-sheet text. Only include values explicitly present in the source text. ' +
  'Use Russian for spec key labels.';

const FILE_SYSTEM_PROMPT =
  'You extract structured heavy equipment specifications from photos of machines, ' +
  'nameplates, rating plates, brochures and PDF spec sheets. Only include values that are ' +
  'explicitly visible or stated in the file; never guess. Use Russian for spec key labels.';

const FILE_INSTRUCTION =
  'Извлеки марку, модель, год выпуска и технические характеристики техники из этого файла ' +
  'и передай их через инструмент submit_specs.';

export const SPEC_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const SPEC_DOCUMENT_MEDIA_TYPES = ['application/pdf'] as const;
export const SPEC_FILE_MEDIA_TYPES = [...SPEC_IMAGE_MEDIA_TYPES, ...SPEC_DOCUMENT_MEDIA_TYPES];

export type SpecImageMediaType = (typeof SPEC_IMAGE_MEDIA_TYPES)[number];
export type SpecDocumentMediaType = (typeof SPEC_DOCUMENT_MEDIA_TYPES)[number];
export type SpecFileMediaType = SpecImageMediaType | SpecDocumentMediaType;

export interface SpecExtractionFile {
  /** Base64-encoded file contents (no data: prefix, no newlines). */
  data: string;
  mediaType: SpecFileMediaType;
}

/**
 * Base64 PDF document block. The pinned SDK version predates the `document`
 * content block type, so it is declared here with the wire shape the API
 * accepts; the union cast below keeps the request typed as MessageParam.
 */
interface DocumentBlockParam {
  type: 'document';
  source: { type: 'base64'; media_type: 'application/pdf'; data: string };
}

export function isSpecFileMediaType(value: string): value is SpecFileMediaType {
  return (SPEC_FILE_MEDIA_TYPES as readonly string[]).includes(value);
}

function buildFileContent(file: SpecExtractionFile): Anthropic.MessageParam['content'] {
  const fileBlock: Anthropic.ImageBlockParam | DocumentBlockParam =
    file.mediaType === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.data },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: file.mediaType, data: file.data },
        };

  return [fileBlock as Anthropic.ImageBlockParam, { type: 'text', text: FILE_INSTRUCTION }];
}

async function runExtraction(
  system: string,
  content: Anthropic.MessageParam['content'],
): Promise<ExtractedSpecs> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    system,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
    messages: [{ role: 'user', content }],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a tool_use block');
  }

  return extractedSpecsSchema.parse(toolUse.input);
}

/**
 * Extracts structured make/model/year/spec data from free-form text such as
 * a manufacturer spec sheet or a provider's listing description, so it can
 * be stored on Equipment.specs and used for search/filtering.
 */
export async function extractEquipmentSpecs(sourceText: string): Promise<ExtractedSpecs> {
  return runExtraction(SYSTEM_PROMPT, sourceText);
}

/**
 * Same extraction, but from a photo (JPEG/PNG/WebP) or a PDF spec sheet.
 * Images are sent as an `image` content block, PDFs as a `document` block,
 * followed by a short text instruction; the tool and schema are shared with
 * extractEquipmentSpecs.
 */
export async function extractEquipmentSpecsFromFile(
  file: SpecExtractionFile,
): Promise<ExtractedSpecs> {
  if (!isSpecFileMediaType(file.mediaType)) {
    throw new Error(`Unsupported media type: ${String(file.mediaType)}`);
  }
  return runExtraction(FILE_SYSTEM_PROMPT, buildFileContent(file));
}
