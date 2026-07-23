import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | undefined;

/**
 * Lazily-constructed singleton so importing this module doesn't throw in
 * environments (tests, build) where ANTHROPIC_API_KEY isn't set.
 */
export function getAnthropicClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export const DEFAULT_MODEL = 'claude-sonnet-5';
