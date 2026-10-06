import { describe, expect, it } from 'vitest';
import {
  asSpeaker,
  moodVoice,
  SITE_LINES,
  speechParts,
  splitCensored,
  styleFor,
  voiceFor,
} from './soundVoices';
import { moodLine, MOODS } from '@/lib/stroyka/mood';
import { LINES } from '@/lib/stroyka/lines';

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{200D}/u;

describe('speechParts', () => {
  it('never hands an emoji to speechSynthesis', () => {
    const spoken = (text: string) =>
      speechParts(text)
        .map((p) => (p.beep ? '<beep>' : p.text))
        .join(' ');
    expect(spoken('👷 Здравствуйте! Экскаватор свободен 🚜')).toBe(
      'Здравствуйте! Экскаватор свободен',
    );
    expect(spoken('Кто ковш поставил, #@%&! 🤬🚜')).toBe('Кто ковш поставил, <beep>');
    expect(spoken('Гав! 🐶')).toBe('Гав!');
    expect(speechParts('🎄🎉')).toEqual([]);
    for (const speaker of Object.keys(LINES) as (keyof typeof LINES)[])
      for (const line of LINES[speaker].slice(0, 120))
        for (const kind of ['business', 'joke', 'radio'] as const) {
          const shown = moodLine({ speaker, text: line.text, kind, tags: line.tags, hour: 23 });
          for (const part of speechParts(shown.text))
            if (!part.beep) expect(EMOJI.test(part.text)).toBe(false);
        }
  });
});

describe('moodVoice', () => {
  it('nudges pitch and rate a little, never wildly', () => {
    const base = { pitch: 1, rate: 1 };
    expect(moodVoice(base, 'laugh').rate).toBeGreaterThan(1);
    expect(moodVoice(base, 'angry').pitch).toBeLessThan(1);
    expect(moodVoice(base, undefined)).toEqual(base);
    expect(moodVoice(base, 'nonsense')).toEqual(base);
    for (const mood of MOODS) {
      const v = moodVoice(base, mood);
      expect(Math.abs(v.pitch - 1)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(v.rate - 1)).toBeLessThanOrEqual(0.1);
    }
  });
});

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
