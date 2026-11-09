import { describe, expect, it } from 'vitest';
import { parseOfficeCommand } from './telegramCommand';

describe('parseOfficeCommand', () => {
  it('ignores texts that are not the office command', () => {
    expect(parseOfficeCommand('/id')).toBeNull();
    expect(parseOfficeCommand('привет, офис')).toBeNull();
    expect(parseOfficeCommand('/officer x')).toBeNull();
  });

  it('parses a Russian niche title in any case and a one-word city', () => {
    expect(parseOfficeCommand('/office Стоматология Казань')).toEqual({
      ok: true,
      agent: 'sites',
      niche: 'dentist',
      city: 'Казань',
    });
    expect(parseOfficeCommand('/офис СТОМАТОЛОГИЯ казань')).toMatchObject({
      ok: true,
      niche: 'dentist',
      city: 'Казань',
    });
    expect(parseOfficeCommand('/office@iistroyka_bot dentist Казань')).toMatchObject({
      ok: true,
      niche: 'dentist',
    });
  });

  it('parses a two-word city and a two-word niche title', () => {
    expect(parseOfficeCommand('/office спецтехника Набережные Челны')).toEqual({
      ok: true,
      agent: 'providers',
      niche: 'machinery',
      city: 'Набережные Челны',
    });
    expect(parseOfficeCommand('/office салон красоты Набережные Челны')).toMatchObject({
      ok: true,
      agent: 'sites',
      niche: 'beauty',
      city: 'Набережные Челны',
    });
  });

  it('returns the help text without arguments, for an unknown niche and an unknown city', () => {
    const empty = parseOfficeCommand('/office');
    expect(empty).toMatchObject({ ok: false });
    expect((empty as { help: string }).help).toContain('/office стоматология Казань');
    expect((empty as { help: string }).help).toContain('стоматология (dentist)');

    const unknown = parseOfficeCommand('/office пекарня Казань');
    expect(unknown).toMatchObject({ ok: false });
    expect((unknown as { help: string }).help).toContain('Неизвестная ниша «пекарня»');

    const noCity = parseOfficeCommand('/office стоматология');
    expect((noCity as { help: string }).help).toContain('Укажите город');

    const badCity = parseOfficeCommand('/office стоматология Нигде-град');
    expect((badCity as { help: string }).help).toContain('не найден в списке городов');
  });
});
