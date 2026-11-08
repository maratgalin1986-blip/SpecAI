import { describe, expect, it } from 'vitest';
import { checkBecomeProvider, modeHome, modeSwitchKind, profileHint, showsModePill } from './modes';

describe('who sees which mode switch', () => {
  it('gives the provider admin the «Заказчик | Исполнитель» switch everywhere', () => {
    expect(modeSwitchKind('PROVIDER_ADMIN')).toBe('switch');
    expect(showsModePill('PROVIDER_ADMIN')).toBe(true);
    expect(profileHint('PROVIDER_ADMIN')).toBe('profile.switch');
  });

  it('offers a customer «Стать исполнителем», without the switch on main screens', () => {
    expect(modeSwitchKind('CUSTOMER')).toBe('become');
    expect(showsModePill('CUSTOMER')).toBe(false);
    expect(profileHint('CUSTOMER')).toBe('profile.become');
  });

  it('shows nothing to an operator, a platform admin or a signed-out phone', () => {
    for (const role of ['PROVIDER_OPERATOR', 'PLATFORM_ADMIN', undefined, null]) {
      expect(modeSwitchKind(role)).toBe('none');
      expect(showsModePill(role)).toBe(false);
      expect(profileHint(role)).toBeNull();
    }
  });

  it('opens the first screen of each mode', () => {
    expect(modeHome('provider')).toBe('/(tabs)/feed');
    expect(modeHome('customer')).toBe('/(tabs)');
  });
});

describe('«Стать исполнителем» form', () => {
  const valid = { companyName: 'ИП Иванов', baseAddress: 'Набережные Челны, Мира, 3', phone: '' };

  it('accepts a name and an address, phone optional', () => {
    expect(checkBecomeProvider(valid)).toEqual({
      ok: true,
      value: { companyName: 'ИП Иванов', baseAddress: 'Набережные Челны, Мира, 3' },
    });
    expect(checkBecomeProvider({ ...valid, phone: ' +7 (927) 242-80-88 ' })).toEqual({
      ok: true,
      value: {
        companyName: 'ИП Иванов',
        baseAddress: 'Набережные Челны, Мира, 3',
        phone: '+7 (927) 242-80-88',
      },
    });
  });

  it('trims and collapses spaces like the server', () => {
    const result = checkBecomeProvider({
      companyName: '  ООО   «Техника+» ',
      baseAddress: ' Елабуга,   Окружное шоссе ',
      phone: '',
    });
    expect(result).toEqual({
      ok: true,
      value: { companyName: 'ООО «Техника+»', baseAddress: 'Елабуга, Окружное шоссе' },
    });
  });

  it('asks for the name first, in Russian', () => {
    const result = checkBecomeProvider({ ...valid, companyName: '   ' });
    expect(result).toEqual({
      ok: false,
      field: 'companyName',
      error: 'Укажите название компании или ваше имя',
    });
    expect(checkBecomeProvider({ ...valid, companyName: 'x'.repeat(201) })).toMatchObject({
      ok: false,
      field: 'companyName',
    });
  });

  it('needs the place where the machinery stands', () => {
    expect(checkBecomeProvider({ ...valid, baseAddress: 'Ок' })).toMatchObject({
      ok: false,
      field: 'baseAddress',
    });
    expect(checkBecomeProvider({ ...valid, baseAddress: 'a'.repeat(201) })).toMatchObject({
      ok: false,
      field: 'baseAddress',
    });
  });

  it('checks a typed phone but never requires one', () => {
    expect(checkBecomeProvider({ ...valid, phone: '12345' })).toMatchObject({
      ok: false,
      field: 'phone',
    });
    expect(checkBecomeProvider({ ...valid, phone: 'позвоните мне' })).toMatchObject({
      ok: false,
      field: 'phone',
    });
    expect(checkBecomeProvider({ ...valid, phone: '8 927 242 80 88' }).ok).toBe(true);
  });

  it('never mentions «кабинет» or «вкладка» in errors', () => {
    const errors = [
      checkBecomeProvider({ ...valid, companyName: '' }),
      checkBecomeProvider({ ...valid, baseAddress: '' }),
      checkBecomeProvider({ ...valid, phone: '1' }),
    ];
    for (const result of errors) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toMatch(/кабинет|вкладк/i);
    }
  });
});
