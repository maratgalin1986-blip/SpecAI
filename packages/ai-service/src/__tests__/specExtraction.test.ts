import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../client', () => ({
  DEFAULT_MODEL: 'test-model',
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

import { extractEquipmentSpecs } from '../specExtraction';

describe('extractEquipmentSpecs', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('parses the tool_use block into ExtractedSpecs', async () => {
    const input = {
      make: 'JCB',
      model: '3CX',
      year: 2019,
      specs: { 'Эксплуатационная масса, кг': 8070, 'Мощность двигателя, л.с.': '92', Кабина: true },
    };
    createMock.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'submit_specs', input }],
    });

    const result = await extractEquipmentSpecs('JCB 3CX 2019, масса 8070 кг, 92 л.с.');

    expect(result).toEqual(input);
    const request = createMock.mock.calls[0]?.[0];
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'submit_specs' });
    expect(request.messages).toEqual([
      { role: 'user', content: 'JCB 3CX 2019, масса 8070 кг, 92 л.с.' },
    ]);
  });

  it('throws when the model returns no tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Нет данных.' }] });

    await expect(extractEquipmentSpecs('пусто')).rejects.toThrow(
      'Model did not return a tool_use block',
    );
  });

  it('rejects specs with nested objects or a non-integer year', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'submit_specs',
          input: { year: 2019.5, specs: { Двигатель: { мощность: 92 } } },
        },
      ],
    });

    await expect(extractEquipmentSpecs('текст')).rejects.toThrow();
  });
});
