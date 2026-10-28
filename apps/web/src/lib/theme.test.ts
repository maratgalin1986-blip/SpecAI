import { describe, expect, it } from 'vitest';
import { resolveTheme, savedTheme, THEME_INIT_SCRIPT, THEME_KEY } from './theme';

describe('theme', () => {
  it('follows the system until the visitor picks', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('reads only valid picks and survives blocked storage', () => {
    expect(savedTheme({ getItem: () => 'dark' })).toBe('dark');
    expect(savedTheme({ getItem: () => 'neon' })).toBeNull();
    expect(savedTheme(undefined)).toBeNull();
    expect(
      savedTheme({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    ).toBeNull();
  });

  it('the inline script uses the same key and guards storage', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_INIT_SCRIPT.startsWith('try{')).toBe(true);
  });
});
