import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamMock = vi.fn();

vi.mock('../client', () => ({
  DEFAULT_MODEL: 'test-model',
  getAnthropicClient: () => ({ messages: { stream: streamMock } }),
}));

import { streamAssistantReply, replyToCustomer } from '../assistant';
import { SEARCH_EQUIPMENT_TOOL_NAME } from '../assistantTools';

type Block =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/**
 * Builds a fake MessageStream: async-iterable over content_block_delta events
 * for text blocks, plus finalMessage() returning the assembled message.
 */
function fakeStream(blocks: Block[], stopReason: 'end_turn' | 'tool_use') {
  const events = blocks.flatMap((block, index) =>
    block.type === 'text'
      ? block.text.split(' ').map((word, i, words) => ({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: i < words.length - 1 ? `${word} ` : word },
        }))
      : [],
  );
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    finalMessage: async () => ({ content: blocks, stop_reason: stopReason }),
  };
}

async function collect(gen: ReturnType<typeof streamAssistantReply>) {
  const deltas: string[] = [];
  let step = await gen.next();
  while (!step.done) {
    deltas.push(step.value);
    step = await gen.next();
  }
  return { deltas, result: step.value };
}

describe('streamAssistantReply', () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  it('yields text deltas and returns the full text', async () => {
    streamMock.mockReturnValueOnce(
      fakeStream([{ type: 'text', text: 'Привет! Чем могу помочь?' }], 'end_turn'),
    );

    const { deltas, result } = await collect(
      streamAssistantReply({ history: [{ role: 'user', content: 'Привет' }] }),
    );

    expect(deltas.join('')).toBe('Привет! Чем могу помочь?');
    expect(deltas.length).toBeGreaterThan(1);
    expect(result.text).toBe('Привет! Чем могу помочь?');
    expect(result.toolCalls).toEqual([]);
    expect(result.stopReason).toBe('end_turn');

    expect(streamMock).toHaveBeenCalledTimes(1);
    const params = streamMock.mock.calls[0]?.[0];
    expect(params.model).toBe('test-model');
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual([
      'search_equipment',
      'get_my_bookings',
    ]);
    expect(params.messages).toEqual([{ role: 'user', content: 'Привет' }]);
  });

  it('calls onToolCall for tool_use and sends the result back to the model', async () => {
    const toolInput = { city: 'Москва', category: 'excavators' };
    streamMock
      .mockReturnValueOnce(
        fakeStream(
          [
            { type: 'text', text: 'Ищу технику...' },
            { type: 'tool_use', id: 'toolu_1', name: SEARCH_EQUIPMENT_TOOL_NAME, input: toolInput },
          ],
          'tool_use',
        ),
      )
      .mockReturnValueOnce(
        fakeStream([{ type: 'text', text: 'Нашёл экскаватор JCB 3CX.' }], 'end_turn'),
      );

    const onToolCall = vi.fn().mockResolvedValue([{ id: 'eq_1', name: 'Экскаватор JCB 3CX' }]);

    const { deltas, result } = await collect(
      streamAssistantReply({
        history: [{ role: 'user', content: 'Нужен экскаватор в Москве' }],
        onToolCall,
      }),
    );

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith(SEARCH_EQUIPMENT_TOOL_NAME, toolInput);

    expect(streamMock).toHaveBeenCalledTimes(2);
    const secondParams = streamMock.mock.calls[1]?.[0];
    expect(secondParams.messages).toHaveLength(3);
    expect(secondParams.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Ищу технику...' },
        { type: 'tool_use', id: 'toolu_1', name: SEARCH_EQUIPMENT_TOOL_NAME, input: toolInput },
      ],
    });
    expect(secondParams.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: JSON.stringify([{ id: 'eq_1', name: 'Экскаватор JCB 3CX' }]),
        },
      ],
    });

    expect(deltas.join('')).toBe('Ищу технику...\nНашёл экскаватор JCB 3CX.');
    expect(result.text).toBe('Ищу технику...\nНашёл экскаватор JCB 3CX.');
    expect(result.toolCalls).toEqual([
      { name: SEARCH_EQUIPMENT_TOOL_NAME, input: toolInput, ok: true },
    ]);
  });

  it('reports tool errors back as is_error tool_result', async () => {
    streamMock
      .mockReturnValueOnce(
        fakeStream(
          [{ type: 'tool_use', id: 'toolu_1', name: 'get_my_bookings', input: {} }],
          'tool_use',
        ),
      )
      .mockReturnValueOnce(fakeStream([{ type: 'text', text: 'Не удалось.' }], 'end_turn'));

    const onToolCall = vi.fn().mockRejectedValue(new Error('db down'));
    const { result } = await collect(
      streamAssistantReply({ history: [{ role: 'user', content: 'Мои брони' }], onToolCall }),
    );

    const secondParams = streamMock.mock.calls[1]?.[0];
    expect(secondParams.messages[2].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: true,
      content: 'db down',
    });
    expect(result.toolCalls).toEqual([{ name: 'get_my_bookings', input: {}, ok: false }]);
  });

  it('rejects unknown tools without calling onToolCall', async () => {
    streamMock
      .mockReturnValueOnce(
        fakeStream(
          [{ type: 'tool_use', id: 'toolu_1', name: 'delete_everything', input: {} }],
          'tool_use',
        ),
      )
      .mockReturnValueOnce(fakeStream([{ type: 'text', text: 'Ок.' }], 'end_turn'));

    const onToolCall = vi.fn();
    await collect(streamAssistantReply({ history: [{ role: 'user', content: 'x' }], onToolCall }));

    expect(onToolCall).not.toHaveBeenCalled();
    const secondParams = streamMock.mock.calls[1]?.[0];
    expect(secondParams.messages[2].content[0].is_error).toBe(true);
  });

  it('stops offering tools after the maximum number of rounds', async () => {
    const toolTurn = () =>
      fakeStream(
        [{ type: 'tool_use', id: 'toolu_x', name: 'get_my_bookings', input: {} }],
        'tool_use',
      );
    streamMock
      .mockReturnValueOnce(toolTurn())
      .mockReturnValueOnce(toolTurn())
      .mockReturnValueOnce(toolTurn())
      .mockReturnValueOnce(fakeStream([{ type: 'text', text: 'Готово.' }], 'end_turn'));

    const onToolCall = vi.fn().mockResolvedValue([]);
    const { result } = await collect(
      streamAssistantReply({ history: [{ role: 'user', content: 'x' }], onToolCall }),
    );

    expect(onToolCall).toHaveBeenCalledTimes(3);
    expect(streamMock).toHaveBeenCalledTimes(4);
    expect(streamMock.mock.calls[2]?.[0].tools).toBeDefined();
    expect(streamMock.mock.calls[3]?.[0].tools).toBeUndefined();
    expect(result.text).toBe('Готово.');
  });

  it('replyToCustomer collects the full reply', async () => {
    streamMock.mockReturnValueOnce(fakeStream([{ type: 'text', text: 'Да.' }], 'end_turn'));

    const result = await replyToCustomer([{ role: 'user', content: 'Работаете?' }]);

    expect(result.text).toBe('Да.');
  });
});
