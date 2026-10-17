import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/ingest.ts hands a doubtful import to the AI moderator, and only that.

const order = { findFirst: vi.fn(), create: vi.fn() };
vi.mock('@specai/database', () => ({
  prisma: {
    order,
    user: { upsert: vi.fn().mockResolvedValue({ id: 'importer' }) },
    equipmentCategory: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cat-exc', name: 'Экскаваторы' }),
    },
    location: {
      findFirst: vi.fn().mockResolvedValue({ id: 'loc' }),
      create: vi.fn().mockResolvedValue({ id: 'loc' }),
    },
  },
}));
const analyzeChatMessage = vi.fn();
vi.mock('@specai/ai-service', () => ({ analyzeChatMessage }));
vi.mock('@/lib/notify', () => ({ notifyTelegram: vi.fn().mockResolvedValue(true) }));
const notifyProvidersAboutOrder = vi.fn();
vi.mock('@/lib/notifications/notifyUser', () => ({ notifyProvidersAboutOrder }));
const autoModerateOrder = vi.fn();
vi.mock('@/lib/orderModeration', () => ({ autoModerateOrder }));

const { ingestMessage } = await import('./ingest');

const MESSAGE = {
  source: 'TELEGRAM' as const,
  externalId: 'telegram:-100:1',
  text: 'Нужен экскаватор завтра в Елабуге, копать траншею',
  chatTitle: 'Стройка',
};

function analysis(confidence: number) {
  return { is_request: true, confidence, category_slug: 'excavators', city: 'Елабуга' };
}

describe('ingestMessage and the AI moderator', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    order.findFirst.mockReset();
    order.create.mockReset();
    analyzeChatMessage.mockReset();
    notifyProvidersAboutOrder.mockReset();
    autoModerateOrder.mockReset();
    order.findFirst.mockResolvedValue(null);
    order.create.mockImplementation(({ data }: { data: { status: string } }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends a doubtful import to the moderator, the result stays the same', async () => {
    analyzeChatMessage.mockResolvedValue(analysis(0.5));
    autoModerateOrder.mockResolvedValue({ status: 'published', reason: 'нужен экскаватор' });

    const result = await ingestMessage(MESSAGE);

    expect(order.create.mock.calls[0]?.[0].data.status).toBe('PENDING_REVIEW');
    expect(autoModerateOrder).toHaveBeenCalledWith('o1', { timeoutMs: 6000 });
    expect(result).toEqual({ status: 'created', orderId: 'o1', published: false });
    expect(notifyProvidersAboutOrder).not.toHaveBeenCalled();
  });

  it('does not ask the moderator about a confident import', async () => {
    analyzeChatMessage.mockResolvedValue(analysis(0.9));

    const result = await ingestMessage(MESSAGE);

    expect(order.create.mock.calls[0]?.[0].data.status).toBe('OPEN');
    expect(autoModerateOrder).not.toHaveBeenCalled();
    expect(notifyProvidersAboutOrder).toHaveBeenCalledWith('o1');
    expect(result).toEqual({ status: 'created', orderId: 'o1', published: true });
  });

  it('keeps the import when the moderator fails', async () => {
    analyzeChatMessage.mockResolvedValue(analysis(0.5));
    autoModerateOrder.mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(ingestMessage(MESSAGE)).resolves.toEqual({
      status: 'created',
      orderId: 'o1',
      published: false,
    });
  });

  it('does not reach the moderator for messages that are not orders', async () => {
    analyzeChatMessage.mockResolvedValue({ is_request: false, confidence: 0.9 });
    await expect(ingestMessage(MESSAGE)).resolves.toMatchObject({ status: 'ignored' });
    expect(order.create).not.toHaveBeenCalled();
    expect(autoModerateOrder).not.toHaveBeenCalled();
  });
});
