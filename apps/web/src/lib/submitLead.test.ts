import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/marketing', () => ({
  currentChannel: () => 'direct',
  withChannel: (source: string) => source,
  reachGoal: vi.fn(),
  analyticsRefused: () => false,
  currentYclid: () => '',
}));

const { submitLead, messageWithYclid } = await import('./submitLead');
const payload = { phone: '+79270000000', source: 'home', consent: true };

describe('submitLead', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries once after a network failure', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const done = submitLead(payload);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(done).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails after the retry fails too', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const done = submitLead(payload);
    const check = expect(done).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2000);
    await check;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected form', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Проверьте телефон' }), { status: 400 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(submitLead(payload)).rejects.toThrow('Проверьте телефон');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('leads already received', () => {
  it('treats a repeat from the same number as done, not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'уже получили', alreadyReceived: true }), {
          status: 429,
        }),
      ),
    );
    await expect(submitLead(payload)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('messageWithYclid', () => {
  it('appends the Direct click id within the 1000-character limit', () => {
    expect(messageWithYclid('Нужен самосвал', '123')).toBe('Нужен самосвал\nyclid: 123');
    expect(messageWithYclid('', '123')).toBe('yclid: 123');
    expect(messageWithYclid('а'.repeat(1200), '123')!.length).toBeLessThanOrEqual(1000);
    expect(messageWithYclid('текст', '')).toBe('текст');
  });
});
