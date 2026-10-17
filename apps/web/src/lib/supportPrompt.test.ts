import { describe, expect, it } from 'vitest';
import {
  SUPPORT_DISMISSED_KEY,
  SUPPORT_KEEP,
  SUPPORT_TRACKED,
  completedBookingIds,
  parseDismissedIds,
  parsePublicSupport,
  readDismissedIds,
  rememberDismissedIds,
  shouldOfferSupport,
  withDismissed,
} from './supportPrompt';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('support prompt visibility', () => {
  it('counts completed bookings only', () => {
    expect(
      completedBookingIds([
        { id: 'a', status: 'COMPLETED' },
        { id: 'b', status: 'ACTIVE' },
        { id: 'c', status: 'CANCELLED' },
        { id: 'd', status: 'COMPLETED' },
      ]),
    ).toEqual(['a', 'd']);
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, status: 'COMPLETED' }));
    expect(completedBookingIds(many)).toHaveLength(SUPPORT_TRACKED);
  });

  it('shows when on, a completed booking exists and it is not closed', () => {
    expect(shouldOfferSupport(true, ['a'], [])).toBe(true);
    expect(shouldOfferSupport(true, ['a', 'b'], ['a'])).toBe(true);
  });

  it('stays hidden when off, nothing completed or everything closed', () => {
    expect(shouldOfferSupport(false, ['a'], [])).toBe(false);
    expect(shouldOfferSupport(true, [], [])).toBe(false);
    expect(shouldOfferSupport(true, ['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('reads the public answer defensively', () => {
    expect(parsePublicSupport({ enabled: false })).toEqual({ enabled: false });
    expect(parsePublicSupport(null)).toEqual({ enabled: false });
    expect(parsePublicSupport({ enabled: true, card: 'abc' })).toEqual({ enabled: false });
    expect(
      parsePublicSupport({
        enabled: true,
        card: '4111 1111 1111 1111',
        recipient: 'Иван И.',
        amounts: [100, -1, 'x', 300],
      }),
    ).toEqual({
      enabled: true,
      card: '4111 1111 1111 1111',
      recipient: 'Иван И.',
      amounts: [100, 300],
    });
  });
});

describe('closed booking ids in the browser', () => {
  it('ignores junk', () => {
    expect(parseDismissedIds('["a",1,null,"b"]')).toEqual(['a', 'b']);
    expect(parseDismissedIds('{')).toEqual([]);
    expect(parseDismissedIds('{"a":1}')).toEqual([]);
    expect(parseDismissedIds(null)).toEqual([]);
  });

  it('remembers new ids first and keeps the list short', () => {
    expect(withDismissed(['a', 'b'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
    const old = Array.from({ length: SUPPORT_KEEP }, (_, i) => `old${i}`);
    const next = withDismissed(old, ['new']);
    expect(next).toHaveLength(SUPPORT_KEEP);
    expect(next[0]).toBe('new');
  });

  it('saves and reads back, and survives a broken storage', () => {
    const storage = memory({ [SUPPORT_DISMISSED_KEY]: '["a"]' });
    expect(rememberDismissedIds(['b'], storage)).toEqual(['b', 'a']);
    expect(readDismissedIds(storage)).toEqual(['b', 'a']);
    expect(shouldOfferSupport(true, ['a', 'b'], readDismissedIds(storage))).toBe(false);

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readDismissedIds(broken)).toEqual([]);
    expect(rememberDismissedIds(['x'], broken)).toEqual(['x']);
    expect(readDismissedIds(null)).toEqual([]);
  });
});
