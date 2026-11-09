import { describe, expect, it } from 'vitest';
import {
  createStorozhState,
  LEAD_SENT_KEY,
  markLeadSent,
  onMouseLeave,
  onScroll,
  onVisibilityChange,
  snoozeStorozh,
  STOROZH_SNOOZE_KEY,
  STOROZH_SNOOZE_MS,
  storozhBlockedReason,
  storozhPathAllowed,
} from './storozh';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const T0 = 1_000_000;

describe('storozh: routes', () => {
  it('speaks on the home page, machine pages and city pages', () => {
    expect(storozhPathAllowed('/')).toBe(true);
    expect(storozhPathAllowed('/arenda/samosval')).toBe(true);
    expect(storozhPathAllowed('/arenda/ekskavator-pogruzchik/kazan')).toBe(true);
  });
  it('keeps quiet on the owner, legal and film pages', () => {
    for (const path of [
      '/admin',
      '/admin/leads',
      '/provider',
      '/dashboard',
      '/privacy',
      '/soglasie',
      '/stroyka',
      '/stroyka/x',
    ])
      expect(storozhPathAllowed(path), path).toBe(false);
    expect(storozhPathAllowed(null)).toBe(false);
    expect(storozhPathAllowed('/smeta')).toBe(false);
  });
});

describe('storozh: memory', () => {
  it('never asks a customer who already sent a lead', () => {
    const storage = memory();
    expect(storozhBlockedReason(storage, T0)).toBeNull();
    markLeadSent(storage, T0);
    expect(storage.data[LEAD_SENT_KEY]).toBe(String(T0));
    expect(storozhBlockedReason(storage, T0 + 365 * 86_400_000)).toBe('lead-sent');
  });
  it('«Нет, спасибо» snoozes for 7 days', () => {
    const storage = memory();
    snoozeStorozh(storage, T0);
    expect(storage.data[STOROZH_SNOOZE_KEY]).toBe(String(T0 + STOROZH_SNOOZE_MS));
    expect(storozhBlockedReason(storage, T0 + STOROZH_SNOOZE_MS - 1)).toBe('snoozed');
    expect(storozhBlockedReason(storage, T0 + STOROZH_SNOOZE_MS)).toBeNull();
  });
  it('tolerates blocked storage and garbage', () => {
    expect(storozhBlockedReason(null, T0)).toBeNull();
    expect(storozhBlockedReason(memory({ [STOROZH_SNOOZE_KEY]: 'x' }), T0)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(storozhBlockedReason(broken, T0)).toBeNull();
    expect(() => snoozeStorozh(broken, T0)).not.toThrow();
    expect(() => markLeadSent(broken, T0)).not.toThrow();
  });
});

describe('storozh: desktop exit', () => {
  it('waits 20 s, needs the top edge, fires once', () => {
    const state = createStorozhState(T0);
    expect(onMouseLeave(state, -1, T0 + 19_999)).toBeNull();
    expect(onMouseLeave(state, 300, T0 + 30_000)).toBeNull();
    expect(onMouseLeave(state, 0, T0 + 20_000)).toBe('mouse-exit');
    expect(onMouseLeave(state, -1, T0 + 40_000)).toBeNull();
    expect(onVisibilityChange(state, false, T0 + 60_000)).toBeNull();
  });
});

describe('storozh: phone', () => {
  it('fires on a fast flick up after 40% depth and 25 s', () => {
    const state = createStorozhState(T0);
    // Reads down to 60% of a 4000 px page in an 800 px viewport.
    expect(onScroll(state, 1600, 4000, 800, T0 + 10_000)).toBeNull();
    expect(state.maxDepth).toBe(0.6);
    // A fast flick up too early: nothing.
    expect(onScroll(state, 1000, 4000, 800, T0 + 10_200)).toBeNull();
    // Slow scrolling up later: nothing.
    expect(onScroll(state, 900, 4000, 800, T0 + 30_000)).toBeNull();
    // 400 px in 200 ms = 2 px/ms: the visitor heads for the address bar.
    expect(onScroll(state, 500, 4000, 800, T0 + 30_200)).toBe('scroll-back');
    expect(onScroll(state, 0, 4000, 800, T0 + 30_400)).toBeNull();
  });
  it('ignores a flick up when the page was barely read', () => {
    const state = createStorozhState(T0);
    expect(onScroll(state, 400, 4000, 800, T0 + 30_000)).toBeNull();
    expect(onScroll(state, 0, 4000, 800, T0 + 30_200)).toBeNull();
    expect(state.fired).toBe(false);
  });
  it('ignores scrolling down and stale samples', () => {
    const state = createStorozhState(T0);
    onScroll(state, 0, 4000, 800, T0 + 30_000);
    expect(onScroll(state, 2000, 4000, 800, T0 + 30_100)).toBeNull();
    // A sample more than 400 ms old says nothing about speed.
    expect(onScroll(state, 0, 4000, 800, T0 + 31_000)).toBeNull();
  });
  it('fires when the tab comes back after 25 s, not before, not without hiding', () => {
    const early = createStorozhState(T0);
    onVisibilityChange(early, true, T0 + 5_000);
    expect(onVisibilityChange(early, false, T0 + 24_999)).toBeNull();
    expect(onVisibilityChange(early, false, T0 + 25_000)).toBe('tab-return');

    const noHide = createStorozhState(T0);
    expect(onVisibilityChange(noHide, false, T0 + 60_000)).toBeNull();
  });
});
