import { getAnthropicClient, DEFAULT_MODEL } from './client';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * General-purpose support chat turn: answers questions about rentals,
 * bookings, and platform policy given the running conversation history.
 */
export async function replyToCustomer(history: AssistantMessage[]): Promise<string> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system:
      'You are the SpecAI customer support assistant for a heavy equipment rental and ' +
      'construction services platform. Be concise and helpful. If you are unsure about ' +
      'account-specific details, say so instead of guessing. Always respond in Russian.',
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}
