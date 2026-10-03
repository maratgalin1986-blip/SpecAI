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
  it('finds Russian landlines', () => {
    expect(findPhone('звоните 8 (8552) 12-34-56')).toBe('+78552123456');
    expect(findPhone('+7 843 123 45 67')).toBe('+78431234567');
    expect(findPhone('(8552) 12-34-56 после обеда')).toBe('+78552123456');
    expect(findPhone('8-495-123-45-67')).toBe('+74951234567');
    expect(findPhone('офис 3519876543')).toBe('+73519876543');
    expect(findPhone('8 (85594) 2-12-34')).toBe('+78559421234');
  });
  it('does not take toll-free lines, sums, dates or sizes for a landline', () => {
    expect(findPhone('8 800 555-35-35')).toBeNull();
    expect(findPhone('бюджет 4 500 000 000 рублей')).toBeNull();
    expect(findPhone('размеры 400 300 4500 мм')).toBeNull();
    expect(findPhone('плиты 3000 4000 500')).toBeNull();
    expect(findPhone('с 12.10.2026 по 15.10.2026, 8 часов, 4500 ₽/ч')).toBeNull();
    expect(findPhone('2026-10-12 10-00')).toBeNull();
    expect(findPhone('счёт 123456789012')).toBeNull();
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

describe('matchTask for lifting and removal jobs', () => {
  it('sends lifting slabs to a crane and rubbish removal to a dump truck', () => {
    expect(matchTask('Поднять плиты по 3 т на высоту 10 м')?.category).toBe('Краны');
    expect(matchTask('Вывезти мусор после демонтажа, 20 кубов')?.category).toBe('Самосвалы');
    expect(matchTask('Разбить бетон')?.category).toBe('Экскаваторы');
  });
});
