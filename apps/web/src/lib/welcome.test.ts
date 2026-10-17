import { describe, expect, it } from 'vitest';
import { accountTypeFromQuery, WELCOME_PATHS } from './welcome';

const query = (search: string) => accountTypeFromQuery(new URLSearchParams(search));

describe('welcome before sign-up', () => {
  it('maps ?role= to the account type of the register form', () => {
    expect(query('role=provider')).toBe('PROVIDER');
    expect(query('role=customer')).toBe('CUSTOMER');
    expect(query('role=Provider')).toBe('PROVIDER');
  });

  it('keeps the older ?type=provider links working', () => {
    expect(query('type=provider')).toBe('PROVIDER');
    expect(query('type=provider&ref=ABC123')).toBe('PROVIDER');
  });

  it('leaves the form as it is for no or an unknown role', () => {
    expect(query('')).toBeNull();
    expect(query('role=admin')).toBeNull();
    expect(query('role=PROVIDER_ADMIN')).toBeNull();
  });

  it('offers the two paths, customer first, both free', () => {
    expect(WELCOME_PATHS.map((path) => path.role)).toEqual(['customer', 'provider']);
    expect(WELCOME_PATHS.map((path) => path.title)).toEqual([
      'Мне нужна техника',
      'У меня есть техника',
    ]);
    for (const path of WELCOME_PATHS) expect(path.text).toContain('Бесплатно и без посредников');
    // No superlatives next to the promise (REVIEW.md, ФЗ «О рекламе», ст. 5).
    for (const path of WELCOME_PATHS) expect(path.text).not.toMatch(/лучш|самы[ейх]|гарант/i);
    for (const path of WELCOME_PATHS) expect(query(`role=${path.role}`)).toBe(path.accountType);
  });
});
