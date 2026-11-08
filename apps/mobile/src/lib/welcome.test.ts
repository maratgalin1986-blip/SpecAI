import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({
  STORAGE_KEYS: { welcomeSeen: 'specai.welcomeSeen' },
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
}));

const { accountTypeFromRole, parseWelcomeSeen, WELCOME_PATHS } = await import('./welcome');

describe('welcome before sign-in', () => {
  it('maps the role param to the account type of the register screen', () => {
    expect(accountTypeFromRole('customer')).toBe('CUSTOMER');
    expect(accountTypeFromRole('provider')).toBe('PROVIDER');
    expect(accountTypeFromRole(' Provider ')).toBe('PROVIDER');
    expect(accountTypeFromRole(['provider', 'customer'])).toBe('PROVIDER');
  });

  it('leaves the register screen as it is for no or an unknown role', () => {
    expect(accountTypeFromRole(undefined)).toBeNull();
    expect(accountTypeFromRole(null)).toBeNull();
    expect(accountTypeFromRole('')).toBeNull();
    expect(accountTypeFromRole('PROVIDER_ADMIN')).toBeNull();
  });

  it('every card opens the register screen with its own role', () => {
    expect(WELCOME_PATHS.map((path) => path.title)).toEqual([
      'Мне нужна техника',
      'У меня есть техника',
    ]);
    for (const path of WELCOME_PATHS) {
      expect(accountTypeFromRole(path.role)).toBe(path.accountType);
      expect(path.text).toContain('Бесплатно и без посредников');
      // Рядом с обещанием — без «лучшая», «самые», «гарантия» (REVIEW.md).
      expect(path.text).not.toMatch(/лучш|самы[ейх]|гарант/i);
    }
  });

  it('is shown until a path is chosen', () => {
    expect(parseWelcomeSeen(null)).toBe(false);
    expect(parseWelcomeSeen('0')).toBe(false);
    expect(parseWelcomeSeen('1')).toBe(true);
  });
});
