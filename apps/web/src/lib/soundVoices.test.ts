import { describe, expect, it } from 'vitest';
import { asSpeaker, SITE_LINES, splitCensored, styleFor, voiceFor } from './soundVoices';

describe('splitCensored', () => {
  it('turns a symbol run into a beep and never speaks the symbols', () => {
    expect(splitCensored('Кто ковш поставил, #@%&!')).toEqual([
      { beep: false, text: 'Кто ковш поставил,' },
      { beep: true },
    ]);
    expect(splitCensored('Опять песок, #@%&$! Переделываем.')).toEqual([
      { beep: false, text: 'Опять песок,' },
      { beep: true },
      { beep: false, text: 'Переделываем.' },
    ]);
  });

  it('keeps ordinary exclamation marks as punctuation', () => {
    expect(splitCensored('Стоп, стоп! Держи!')).toEqual([
      { beep: false, text: 'Стоп, стоп! Держи!' },
    ]);
  });

  it('leaves no symbols in the spoken parts of the site lines', () => {
    for (const line of SITE_LINES) {
      for (const part of splitCensored(line.text)) {
        if (!part.beep) expect(part.text).not.toMatch(/[#@%&$*]/);
      }
    }
  });

  it('keeps the censored grumbling for the foremen', () => {
    for (const line of SITE_LINES) {
      if (/[#@%&$*]/.test(line.text)) expect(['mihalych', 'ildar']).toContain(line.speaker);
    }
  });
});

describe('voices', () => {
  const voices = [
    { name: 'Microsoft Pavel', lang: 'ru-RU' },
    { name: 'Microsoft Irina', lang: 'ru-RU' },
    { name: 'Yuri', lang: 'ru-RU' },
    { name: 'Samantha', lang: 'en-US' },
  ];

  it('gives Sveta a female voice and the men different ones', () => {
    expect(voiceFor('sveta', voices)?.name).toBe('Microsoft Irina');
    expect(voiceFor('mihalych', voices)?.name).toBe('Microsoft Pavel');
    expect(voiceFor('rinat', voices)?.name).toBe('Yuri');
  });

  it('returns nothing without a Russian voice', () => {
    expect(voiceFor('mihalych', [{ name: 'Samantha', lang: 'en-US' }])).toBeNull();
  });

  it('makes the foreman low and slow', () => {
    const style = styleFor('mihalych', false, () => 0.5);
    expect(style.pitch).toBeCloseTo(0.7, 1);
    expect(style.rate).toBeLessThan(1);
    expect(styleFor('sveta', false, () => 0.5).pitch).toBeGreaterThan(1.1);
  });

  it('maps unknown speakers to a worker', () => {
    expect(asSpeaker('rinat')).toBe('rinat');
    expect(asSpeaker('boss')).toBe('worker');
    expect(asSpeaker(undefined)).toBe('worker');
  });
});
