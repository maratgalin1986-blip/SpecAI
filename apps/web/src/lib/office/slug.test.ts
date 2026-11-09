import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, newToken, prospectSlug, randomSuffix, slugify, translit } from './slug';

describe('translit / slugify', () => {
  it('переводит кириллицу своей таблицей', () => {
    expect(translit('Щука Ёж Юля')).toBe('schuka ezh yulya');
    expect(slugify('ООО «Ромашка-Сервис»!')).toBe('ooo-romashka-servis');
  });

  it('режет по длине без висячего дефиса', () => {
    expect(slugify('авто-сервис-плюс', 5)).toBe('avto');
  });
});

describe('prospectSlug', () => {
  it('строит <название>-<город>-<4 символа>', () => {
    expect(prospectSlug('Стоматология Улыбка', 'Казань', 'ab12')).toBe(
      'stomatologiya-ulybka-kazan-ab12',
    );
  });

  it('не длиннее 60 символов и только [a-z0-9-]', () => {
    const slug = prospectSlug(
      'Очень длинное название компании по аренде спецтехники и экскаваторов номер один',
      'Набережные Челны',
      'zz99',
    );
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.endsWith('-naberezhnye-chelny-zz99')).toBe(true);
  });

  it('пустое название → запасное слово; случайный хвост по умолчанию', () => {
    const slug = prospectSlug('!!!', 'Уфа');
    expect(slug).toMatch(/^kompaniya-ufa-[a-z0-9]{4}$/);
  });
});

describe('newToken / randomSuffix', () => {
  it('32 шестнадцатеричных символа, разные каждый раз', () => {
    const a = newToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newToken()).not.toBe(a);
    expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/);
  });
});
