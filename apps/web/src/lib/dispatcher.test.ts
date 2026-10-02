import { describe, expect, it } from 'vitest';
import { faqAnswers, findPhone, matchTask, wantsPrice } from './dispatcher';

describe('findPhone', () => {
  it('finds Russian mobile numbers in any common spelling', () => {
    expect(findPhone('звоните 8 927 242-80-88')).toBe('+79272428088');
    expect(findPhone('+7 (927) 242 80 88, Иван')).toBe('+79272428088');
    expect(findPhone('мой номер 9272428088')).toBe('+79272428088');
  });
  it('ignores sizes, dates and prices', () => {
    expect(findPhone('траншея 30 метров, 12.10.2026, до 3000 рублей')).toBeNull();
    expect(findPhone('котлован 10×12 м')).toBeNull();
  });
});

describe('matchTask', () => {
  it('maps jobs to machines', () => {
    expect(matchTask('Нужно вырыть траншею 30 метров')?.category).toBe('Экскаваторы-погрузчики');
    expect(matchTask('вывезти строительный мусор')?.category).toBe('Самосвалы');
    expect(matchTask('поднять плиты на 3 этаж, нужен кран')?.category).toBe('Краны');
    expect(matchTask('покраска фасада на высоте 15 м')?.category).toBe('Автовышки');
    expect(matchTask('разбить старый бетон')?.category).toBe('Экскаваторы');
    expect(matchTask('уплотнить щебень под площадку')?.category).toBe('Катки');
    expect(matchTask('спланировать участок')?.category).toBe('Бульдозеры');
    expect(matchTask('почистить снег во дворе')?.category).toBe('Погрузчики');
    expect(matchTask('привезти и выгрузить блоки, манипулятор')?.category).toBe('Манипуляторы');
  });
  it('returns null for small talk', () => {
    expect(matchTask('здравствуйте')).toBeNull();
  });
});

describe('faqAnswers and wantsPrice', () => {
  it('answers VAT and shift questions from site facts', () => {
    expect(faqAnswers('Работаете с НДС?').join(' ')).toContain('НДС');
    expect(faqAnswers('сколько часов смена').join(' ')).toContain('8 часов');
    expect(faqAnswers('привет')).toEqual([]);
  });
  it('detects price questions', () => {
    expect(wantsPrice('Сколько стоит самосвал?')).toBe(true);
    expect(wantsPrice('нужен кран')).toBe(false);
  });
});
