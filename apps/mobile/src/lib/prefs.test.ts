import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  STORAGE_KEYS: {
    appMode: 'specai.appMode',
    providerOnline: 'specai.providerOnline',
    lineOnlineSince: 'specai.lineOnlineSince',
    lineAutoOff: 'specai.lineAutoOff',
  },
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
}));

const {
  DEFAULT_PREFS,
  isProviderMode,
  lineOnlineSince,
  parseOnline,
  parseOnlineSince,
  setLineAutoOff,
  setProviderOnline,
} = await import('./prefs');

describe('prefs', () => {
  it('starts offline: the position is published only after «Выйти на линию»', () => {
    expect(DEFAULT_PREFS.online).toBe(false);
    expect(DEFAULT_PREFS.mode).toBe('provider');
  });

  it('treats only an explicit «1» as online', () => {
    expect(parseOnline('1')).toBe(true);
    expect(parseOnline('0')).toBe(false);
    expect(parseOnline(null)).toBe(false);
    expect(parseOnline(undefined)).toBe(false);
    expect(parseOnline('')).toBe(false);
  });

  it('knows the provider cabinet from «Режим заказчика»', () => {
    expect(isProviderMode('PROVIDER_ADMIN', 'provider')).toBe(true);
    expect(isProviderMode('PROVIDER_ADMIN', 'customer')).toBe(false);
    expect(isProviderMode('CUSTOMER', 'provider')).toBe(false);
  });

  it('remembers when the line began, for the evening switch-off', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-17T05:00:00Z'));
      setLineAutoOff({ reason: 'evening', day: '2026-10-16' });
      setProviderOnline(true);
      expect(lineOnlineSince()).toBe(Date.parse('2026-10-17T05:00:00Z'));
      // Switching on again while on keeps the start.
      vi.setSystemTime(new Date('2026-10-17T09:00:00Z'));
      setProviderOnline(true);
      expect(lineOnlineSince()).toBe(Date.parse('2026-10-17T05:00:00Z'));
      setProviderOnline(false);
      expect(lineOnlineSince()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads a stored start, else «from this launch»', () => {
    expect(parseOnlineSince('1760677200000', 5)).toBe(1760677200000);
    expect(parseOnlineSince('', 5)).toBe(5);
    expect(parseOnlineSince(null, 5)).toBe(5);
    expect(parseOnlineSince('junk', 5)).toBe(5);
  });
});
