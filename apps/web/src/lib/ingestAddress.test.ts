import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/ingest.ts: the street and the house of a chat message go to the order's
// Location, the description carries the summary without them.

const order = { findFirst: vi.fn(), create: vi.fn() };
const location = { findFirst: vi.fn(), create: vi.fn() };
vi.mock('@specai/database', () => ({
  prisma: {
    order,
    location,
    user: { upsert: vi.fn().mockResolvedValue({ id: 'importer' }) },
    equipmentCategory: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cat-crane', name: 'Автокраны' }),
    },
  },
}));
const analyzeChatMessage = vi.fn();
vi.mock('@specai/ai-service', () => ({ analyzeChatMessage }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyProvidersAboutOrder: vi.fn() }));
vi.mock('@/lib/orderModeration', () => ({
  autoModerateOrder: vi.fn(),
  aiModerationEnabled: () => false,
}));

const { chatAddressLine, ingestMessage } = await import('./ingest');

const MESSAGE = {
  source: 'TELEGRAM' as const,
  externalId: 'telegram:-100:7',
  text: 'Нужен автокран 25 т завтра, Елабуга, ул. Строителей, 7, разгрузить плиты',
  chatTitle: 'Стройка',
};

describe('ingestMessage — the address of a chat order', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    order.findFirst.mockReset().mockResolvedValue(null);
    order.create
      .mockReset()
      .mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'o1', ...data }));
    location.findFirst.mockReset().mockResolvedValue({ id: 'loc-city' });
    location.create.mockReset().mockResolvedValue({ id: 'loc-site' });
    analyzeChatMessage.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('stores the street in a location of its own and the summary in the description', async () => {
    analyzeChatMessage.mockResolvedValue({
      is_request: true,
      confidence: 0.9,
      category_slug: 'cranes',
      city: 'Елабуга',
      address: 'ул. Строителей, 7',
      summary: 'Нужен автокран 25 т в Елабуге: разгрузить плиты.',
    });

    await ingestMessage(MESSAGE);

    expect(location.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        addressLine: 'Елабуга, ул. Строителей, 7',
        city: 'Елабуга',
        country: 'Россия',
      }),
    });
    const data = order.create.mock.calls[0]?.[0].data;
    expect(data.locationId).toBe('loc-site');
    expect(data.description).toBe('Нужен автокран 25 т в Елабуге: разгрузить плиты.');
    expect(data.description).not.toContain('Строителей');
  });

  it('shares the town row when the message names only the town', async () => {
    analyzeChatMessage.mockResolvedValue({
      is_request: true,
      confidence: 0.9,
      category_slug: 'cranes',
      city: 'Елабуга',
      summary: 'Нужен автокран 25 т в Елабуге.',
    });

    await ingestMessage(MESSAGE);

    expect(location.create).not.toHaveBeenCalled();
    expect(order.create.mock.calls[0]?.[0].data.locationId).toBe('loc-city');
  });
});

describe('chatAddressLine', () => {
  it('puts the town first and does not repeat it', () => {
    expect(chatAddressLine('Елабуга', 'ул. Строителей, 7')).toBe('Елабуга, ул. Строителей, 7');
    expect(chatAddressLine('Елабуга', 'Елабуга, ул. Строителей, 7')).toBe(
      'Елабуга, ул. Строителей, 7',
    );
    expect(chatAddressLine(undefined, '  ул. Строителей,  7 ')).toBe('ул. Строителей, 7');
  });

  it('carries no contacts', () => {
    expect(chatAddressLine('Елабуга', 'ул. Строителей, 7, тел. 8 917 444-55-66')).not.toContain(
      '444',
    );
  });
});
