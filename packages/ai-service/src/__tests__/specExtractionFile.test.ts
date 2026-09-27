import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../client', () => ({
  DEFAULT_MODEL: 'test-model',
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

import { extractEquipmentSpecsFromFile, isSpecFileMediaType } from '../specExtraction';

const specsInput = {
  make: 'Komatsu',
  model: 'PC200-8',
  year: 2018,
  specs: { 'Эксплуатационная масса, кг': 20300, 'Мощность двигателя, л.с.': 148 },
};

function toolUseMessage(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'submit_specs', input }],
  };
}

describe('extractEquipmentSpecsFromFile', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('sends an image block followed by a text instruction and parses the result', async () => {
    createMock.mockResolvedValue(toolUseMessage(specsInput));

    const result = await extractEquipmentSpecsFromFile({
      data: 'aGVsbG8=',
      mediaType: 'image/jpeg',
    });

    expect(result).toEqual(specsInput);

    const request = createMock.mock.calls[0]?.[0];
    expect(request.model).toBe('test-model');
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'submit_specs' });
    expect(request.tools).toHaveLength(1);
    expect(request.tools[0].name).toBe('submit_specs');

    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    const content = request.messages[0].content;
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' },
    });
    expect(content[1].type).toBe('text');
    expect(content[1].text).toContain('submit_specs');
  });

  it('sends a document block for PDFs', async () => {
    createMock.mockResolvedValue(toolUseMessage({ specs: { 'Длина стрелы, м': 12 } }));

    const result = await extractEquipmentSpecsFromFile({
      data: 'JVBERi0=',
      mediaType: 'application/pdf',
    });

    expect(result).toEqual({ specs: { 'Длина стрелы, м': 12 } });

    const content = createMock.mock.calls[0]?.[0].messages[0].content;
    expect(content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
    });
    expect(content[1].type).toBe('text');
  });

  it('rejects unsupported media types without calling the API', async () => {
    await expect(
      extractEquipmentSpecsFromFile({
        data: 'xx',
        mediaType: 'image/gif' as unknown as 'image/png',
      }),
    ).rejects.toThrow('Unsupported media type');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws when the model returns no tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'Не вижу табличку.' }] });

    await expect(
      extractEquipmentSpecsFromFile({ data: 'aGVsbG8=', mediaType: 'image/png' }),
    ).rejects.toThrow('Model did not return a tool_use block');
  });

  it('rejects invalid tool output', async () => {
    createMock.mockResolvedValue(toolUseMessage({ specs: { Двигатель: { мощность: 92 } } }));

    await expect(
      extractEquipmentSpecsFromFile({ data: 'aGVsbG8=', mediaType: 'image/webp' }),
    ).rejects.toThrow();
  });
});

describe('isSpecFileMediaType', () => {
  it('accepts the supported types and rejects others', () => {
    expect(isSpecFileMediaType('image/jpeg')).toBe(true);
    expect(isSpecFileMediaType('image/png')).toBe(true);
    expect(isSpecFileMediaType('image/webp')).toBe(true);
    expect(isSpecFileMediaType('application/pdf')).toBe(true);
    expect(isSpecFileMediaType('image/gif')).toBe(false);
    expect(isSpecFileMediaType('text/plain')).toBe(false);
  });
});
