import { describe, expect, it } from 'vitest';
import { operatorLogin } from './operatorForm';

describe('operatorLogin', () => {
  it('keeps the existing login when only other fields change', () => {
    expect(operatorLogin({ email: 'op@x.ru', password: '' }, 'op@x.ru')).toEqual({
      ok: true,
      login: null,
    });
    expect(operatorLogin({ email: ' OP@x.ru ', password: '' }, 'op@x.ru')).toEqual({
      ok: true,
      login: null,
    });
  });

  it('sends nothing without an e-mail', () => {
    expect(operatorLogin({ email: '  ', password: '' }, null)).toEqual({ ok: true, login: null });
  });

  it('asks for a password for a new or changed login', () => {
    expect(operatorLogin({ email: 'op@x.ru', password: '' }, null).ok).toBe(false);
    expect(operatorLogin({ email: 'new@x.ru', password: '' }, 'op@x.ru').ok).toBe(false);
    expect(operatorLogin({ email: 'new@x.ru', password: 'secret12' }, 'op@x.ru')).toEqual({
      ok: true,
      login: { email: 'new@x.ru', password: 'secret12' },
    });
  });

  it('resets the password when the provider types a new one', () => {
    expect(operatorLogin({ email: 'op@x.ru', password: 'short' }, 'op@x.ru').ok).toBe(false);
    expect(operatorLogin({ email: 'op@x.ru', password: 'newpass99' }, 'op@x.ru')).toEqual({
      ok: true,
      login: { email: 'op@x.ru', password: 'newpass99' },
    });
  });
});
