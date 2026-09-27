import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../client', () => ({
  DEFAULT_MODEL: 'test-model',
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

import { recommendEquipment, type EquipmentCandidate } from '../recommendation';

const candidates: EquipmentCandidate[] = [
  { id: 'eq_1', name: 'Экскаватор JCB 3CX', category: 'excavators', dailyRate: 15000 },
  { id: 'eq_2', name: 'Кран Liebherr LTM 1030', category: 'cranes', dailyRate: 45000 },
];

function toolUseMessage(input: unknown) {
  return {
    content: [
      { type: 'text', text: 'Подбираю технику...' },
      { type: 'tool_use', id: 'toolu_1', name: 'submit_recommendations', input },
    ],
  };
}

describe('recommendEquipment', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('parses the tool_use block into a RecommendationResult', async () => {
    createMock.mockResolvedValue(
      toolUseMessage({
        recommendations: [{ equipmentId: 'eq_1', reason: 'Подходит для траншей.' }],
        followUpQuestion: 'Какая глубина траншеи?',
      }),
    );

    const result = await recommendEquipment('Выкопать траншею 50 м', candidates);

    expect(result).toEqual({
      recommendations: [{ equipmentId: 'eq_1', reason: 'Подходит для траншей.' }],
      followUpQuestion: 'Какая глубина траншеи?',
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const request = createMock.mock.calls[0]?.[0];
    expect(request.model).toBe('test-model');
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'submit_recommendations' });
    expect(request.messages[0].content).toContain('Выкопать траншею 50 м');
    expect(request.messages[0].content).toContain('"id":"eq_2"');
  });

  it('throws when the model returns no tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Не могу помочь.' }] });

    await expect(recommendEquipment('Что-нибудь', candidates)).rejects.toThrow(
      'Model did not return a tool_use block',
    );
  });

  it('throws when the tool input does not match the result schema', async () => {
    createMock.mockResolvedValue(toolUseMessage({ recommendations: [{ equipmentId: 'eq_1' }] }));

    await expect(recommendEquipment('Что-нибудь', candidates)).rejects.toThrow();
  });

  // Current behaviour: the function trusts the model and does NOT drop ids that
  // are absent from the candidate list. If filtering is added later, this test
  // should be updated to expect only 'eq_1'.
  it('drops equipment ids that are not among the candidates', async () => {
    createMock.mockResolvedValue(
      toolUseMessage({
        recommendations: [
          { equipmentId: 'eq_1', reason: 'Есть в списке.' },
          { equipmentId: 'eq_unknown', reason: 'Выдумано моделью.' },
        ],
      }),
    );

    const result = await recommendEquipment('Работа', candidates);

    expect(result.recommendations.map((r) => r.equipmentId)).toEqual(['eq_1']);
  });
});
