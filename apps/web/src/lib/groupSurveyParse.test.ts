import { describe, expect, it } from 'vitest';
import { parseSurveyAnswer, surveyCategory, surveyPrice } from './groupSurveyParse';

describe('a reply to the group survey', () => {
  it('reads the example of the survey message', () => {
    expect(parseSurveyAnswer('JCB 3CX, Набережные Челны, 3 000 ₽/ч')).toEqual({
      categorySlug: 'backhoe-loaders',
      machineName: 'JCB 3CX',
      city: 'Набережные Челны',
      region: 'Республика Татарстан',
      hourly: 3000,
      shift: null,
    });
  });

  it('reads free forms of the city and the machine', () => {
    const answer = parseSurveyAnswer('Манипулятор Камаз 65115 в Казани 3500 р/час');
    expect(answer).toMatchObject({
      categorySlug: 'crane-trucks',
      city: 'Казань',
      hourly: 3500,
    });
    expect(answer.machineName).toBe('Манипулятор Камаз 65115');
    expect(parseSurveyAnswer('автокран Ивановец 25т, Елабуга, 4500').categorySlug).toBe('cranes');
  });

  it('nothing known: nulls, never a guess', () => {
    expect(parseSurveyAnswer('Привет всем!')).toMatchObject({
      categorySlug: null,
      city: null,
      hourly: null,
      shift: null,
    });
  });
});

describe('prices', () => {
  it('per hour in any usual spelling', () => {
    expect(surveyPrice('3000')).toEqual({ hourly: 3000, shift: null });
    expect(surveyPrice('3 000 ₽/ч')).toEqual({ hourly: 3000, shift: null });
    expect(surveyPrice('3к в час')).toEqual({ hourly: 3000, shift: null });
    expect(surveyPrice('3,5 тыс/ч')).toEqual({ hourly: 3500, shift: null });
    expect(surveyPrice('2800 руб. час')).toEqual({ hourly: 2800, shift: null });
  });

  it('a shift price is kept apart, never as hourly', () => {
    expect(surveyPrice('25 тыс/смена')).toEqual({ hourly: null, shift: 25000 });
    expect(surveyPrice('смена 8ч — 24000 за смену')).toEqual({ hourly: null, shift: 24000 });
    expect(surveyPrice('3000/ч, смена 24 000 за смену')).toEqual({ hourly: 3000, shift: 24000 });
  });

  it('model numbers, tonnage and years are not prices', () => {
    expect(surveyPrice('JCB 3CX')).toEqual({ hourly: null, shift: null });
    expect(surveyPrice('Hitachi ZX200, 4000')).toEqual({ hourly: 4000, shift: null });
    expect(surveyPrice('самосвал 25 т')).toEqual({ hourly: null, shift: null });
    expect(surveyPrice('JCB 4CX 2015 года, 3200')).toEqual({ hourly: 3200, shift: null });
    // A unitless number far beyond an hour's price: unknown, not a shift either.
    expect(surveyPrice('25000')).toEqual({ hourly: null, shift: null });
  });

  it('makes and models stand for the type', () => {
    expect(surveyCategory('JCB 4CX')).toBe('backhoe-loaders');
    expect(surveyCategory('Шакман 25 т')).toBe('dump-trucks');
    expect(surveyCategory('АГП 22 м')).toBe('aerial-platforms');
    // Cyrillic whole words (JavaScript's \b knows only ASCII).
    expect(surveyCategory('Канглим 7 т, Уфа')).toBe('crane-trucks');
    expect(surveyCategory('КМУ, Уфа')).toBe('crane-trucks');
    expect(surveyCategory('Т-130, Уфа, 2000/ч')).toBe('bulldozers');
    expect(surveyCategory('Хово 25 т')).toBe('dump-trucks');
    expect(surveyCategory('Привет, коллеги')).toBeNull();
    // Case forms and model suffixes of brands.
    expect(surveyCategory('Сдам ивановца 25т')).toBe('cranes');
    expect(surveyCategory('на галичанине работаю')).toBe('cranes');
    expect(surveyCategory('два шакмана')).toBe('dump-trucks');
    expect(surveyCategory('XCMG QY25K')).toBe('cranes');
  });

  it('«тр» is thousands, «тонн» is weight', () => {
    expect(surveyPrice('25 тр за смену')).toEqual({ hourly: null, shift: 25000 });
    expect(surveyPrice('самосвал 25 тонн, 3000/ч')).toEqual({ hourly: 3000, shift: null });
  });
});
