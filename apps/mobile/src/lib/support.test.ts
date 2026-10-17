import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('./storage', () => ({
  STORAGE_KEYS: { supportDismissed: 'specai.supportDismissed' },
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));
const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const {
  SUPPORT_KEEP,
  SUPPORT_TEXT,
  SUPPORT_TRACKED,
  cardDigits,
  completedBookingIds,
  fetchSupport,
  parseDismissedIds,
  parseSupport,
  readDismissedIds,
  rememberDismissedIds,
  shouldOfferSupport,
  withDismissed,
} = await import('./support');

describe('support prompt rule', () => {
  it('counts completed bookings only, the first ones in the list', () => {
    expect(
      completedBookingIds([
        { id: 'a', status: 'COMPLETED' },
        { id: 'b', status: 'ACTIVE' },
        { id: 'c', status: 'CANCELLED' },
        { id: 'd', status: 'COMPLETED' },
      ]),
    ).toEqual(['a', 'd']);
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `b${i}`, status: 'COMPLETED' }));
    expect(completedBookingIds(many)).toHaveLength(SUPPORT_TRACKED);
  });

  it('shows only when on, completed and not closed', () => {
    expect(shouldOfferSupport(true, ['a'], [])).toBe(true);
    expect(shouldOfferSupport(true, ['a', 'b'], ['a'])).toBe(true);
    expect(shouldOfferSupport(false, ['a'], [])).toBe(false);
    expect(shouldOfferSupport(true, [], [])).toBe(false);
    expect(shouldOfferSupport(true, ['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('reads the server answer defensively', () => {
    expect(parseSupport({ enabled: false })).toEqual({ enabled: false });
    expect(parseSupport(undefined)).toEqual({ enabled: false });
    expect(parseSupport({ enabled: true, card: '12' })).toEqual({ enabled: false });
    expect(
      parseSupport({ enabled: true, card: '4111 1111 1111 1111', recipient: '', amounts: [100] }),
    ).toEqual({ enabled: true, card: '4111 1111 1111 1111', recipient: null, amounts: [100] });
    expect(cardDigits('4111 1111 1111 1111')).toBe('4111111111111111');
  });

  it('keeps the agreed texts, with no pressure', () => {
    expect(SUPPORT_TEXT.title).toBe('Поддержать ИИСтройка24');
    expect(SUPPORT_TEXT.body).toBe(
      'Площадка бесплатная. Если она помогла — можно поддержать её развитие любой суммой. Это добровольно.',
    );
    expect(Object.values(SUPPORT_TEXT).join(' ')).not.toMatch(/уже поддержал|человек|кабинет/i);
  });
});

describe('closed bookings on the phone', () => {
  beforeEach(() => store.clear());

  it('ignores junk in the stored list', () => {
    expect(parseDismissedIds('["a",2,"b"]')).toEqual(['a', 'b']);
    expect(parseDismissedIds('oops')).toEqual([]);
    expect(parseDismissedIds(null)).toEqual([]);
  });

  it('remembers new ids first and keeps the list short', async () => {
    expect(withDismissed(['a'], ['b', 'a'])).toEqual(['b', 'a']);
    expect(
      withDismissed(
        Array.from({ length: SUPPORT_KEEP }, (_, i) => `o${i}`),
        ['n'],
      ),
    ).toHaveLength(SUPPORT_KEEP);
    await rememberDismissedIds(['a']);
    await rememberDismissedIds(['b']);
    expect(await readDismissedIds()).toEqual(['b', 'a']);
    expect(store.get('specai.supportDismissed')).toBe('["b","a"]');
  });

  it('survives a broken storage', async () => {
    const broken = {
      getItem: vi.fn().mockRejectedValue(new Error('locked')),
      setItem: vi.fn().mockRejectedValue(new Error('locked')),
    };
    expect(await readDismissedIds(broken)).toEqual([]);
    expect(await rememberDismissedIds(['x'], broken)).toEqual(['x']);
  });
});

describe('fetchSupport', () => {
  it('asks the server without the account token and caches for a while', async () => {
    apiFetch.mockResolvedValue({ enabled: true, card: '4111 1111 1111 1111', recipient: null });
    const first = await fetchSupport(1_000);
    expect(first.enabled).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/support', { anonymous: true });
    await fetchSupport(2_000);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('treats a failed request as «off» and retries next time', async () => {
    apiFetch.mockReset();
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchSupport(10_000_000)).toEqual({ enabled: false });
    apiFetch.mockResolvedValueOnce({ enabled: false });
    await fetchSupport(10_000_001);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
