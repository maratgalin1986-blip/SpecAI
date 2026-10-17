import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  STORAGE_KEYS: { appMode: 'specai.appMode', providerOnline: 'specai.providerOnline' },
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
}));

const { DEFAULT_PREFS, isProviderMode, parseOnline } = await import('./prefs');

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
});
