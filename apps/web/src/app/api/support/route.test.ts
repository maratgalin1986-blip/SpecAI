import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { appSetting: { findMany } } }));

const { GET } = await import('./route');

const TEST_CARD = '4111111111111111'; // the well-known test number

function rows(card: string, enabled: string, recipient?: string) {
  return [
    { key: 'support.card', value: card },
    { key: 'support.enabled', value: enabled },
    ...(recipient ? [{ key: 'support.recipient', value: recipient }] : []),
  ];
}

async function get() {
  const response = await GET();
  return { status: response.status, headers: response.headers, body: await response.json() };
}

describe('GET /api/support', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('shows the formatted card, the name and the chips when on', async () => {
    findMany.mockResolvedValue(rows(TEST_CARD, '1', 'Иван И.'));
    const { status, headers, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      card: '4111 1111 1111 1111',
      recipient: 'Иван И.',
      amounts: [100, 300, 500],
    });
    expect(headers.get('x-robots-tag')).toBe('noindex');
  });

  it('hides everything when off', async () => {
    findMany.mockResolvedValue(rows(TEST_CARD, '0', 'Иван И.'));
    expect((await get()).body).toEqual({ enabled: false });
  });

  it('hides everything when the card is not valid or not set', async () => {
    findMany.mockResolvedValue(rows('4111111111111112', '1', 'Иван И.'));
    expect((await get()).body).toEqual({ enabled: false });
    findMany.mockResolvedValue([{ key: 'support.enabled', value: '1' }]);
    expect((await get()).body).toEqual({ enabled: false });
  });

  it('stays quiet when the database fails', async () => {
    findMany.mockRejectedValue(new Error('relation "AppSetting" does not exist'));
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual({ enabled: false });
  });
});
