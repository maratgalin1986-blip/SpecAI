import { describe, expect, it } from 'vitest';
import { decorate, EMOJIS, hasEmoji, moodLine, moodOf, stripEmoji } from '@/lib/stroyka/mood';
import { LINES, RADIO_PAIRS } from '@/lib/stroyka/lines';

const FLAG = /\p{Regional_Indicator}/u;

describe('moodOf', () => {
  it('symbol-swearing is angry with 🤬, and only then', () => {
    const r = moodOf({
      speaker: 'mihalych',
      text: 'Кто ковш на кабель поставил, #@%&!',
      kind: 'joke',
    });
    expect(r.mood).toBe('angry');
    expect(r.emojis[0]).toBe('🤬');
    for (const speaker of Object.keys(LINES) as (keyof typeof LINES)[])
      for (const line of LINES[speaker]) {
        const m = moodOf({ speaker, text: line.text, kind: 'joke' });
        if (m.emojis.includes('🤬')) expect(line.text).toMatch(/[#@%&$*]/);
      }
  });

  it('a lone exclamation mark is not swearing', () => {
    expect(moodOf({ speaker: 'worker', text: 'Вира помалу!', kind: 'joke' }).mood).not.toBe(
      'angry',
    );
  });

  it('jokes get 😄 or 😂', () => {
    const r = moodOf({
      speaker: 'rinat',
      text: 'Мой JCB как старый друг: поворчит, но выкопает.',
      kind: 'joke',
    });
    expect(['happy', 'laugh']).toContain(r.mood);
    expect(r.emojis.some((e) => e === '😄' || e === '😂')).toBe(true);
  });

  it('only lines tagged «joke» get a laughing face', () => {
    const r = moodOf({
      speaker: 'sveta',
      text: 'Туман — машины поедут медленнее, учитываю в графике.',
      kind: 'joke',
      tags: ['talk', 'fog'],
    });
    expect(r.mood).toBe('worried');
    expect(r.emojis).toEqual(['🌫️']);
  });

  it('the foreman greets with 👷 (as a mood), business lines are shown without emoji', () => {
    expect(
      moodOf({ speaker: 'mihalych', text: 'Здравствуйте! Я прораб.', kind: 'business' }).emojis,
    ).toEqual(['👷']);
    const r = moodLine({ speaker: 'mihalych', text: 'Здравствуйте! Я прораб.', kind: 'business' });
    expect(r.emojis).toEqual([]);
    expect(r.text).toBe('Здравствуйте! Я прораб.');
    expect(
      moodOf({ speaker: 'sveta', text: 'Здравствуйте!', kind: 'business' }).emojis,
    ).not.toContain('👷');
  });

  it('machines and materials', () => {
    expect(
      moodOf({ speaker: 'rinat', text: 'Экскаватор прогрет.', kind: 'business' }).emojis,
    ).toEqual(['🚜']);
    expect(
      moodOf({ speaker: 'ildar', text: 'Плиту на второй этаж.', kind: 'business' }).emojis,
    ).toEqual(['🏗️']);
    expect(moodOf({ speaker: 'sveta', text: 'Самосвал выехал.', kind: 'business' }).emojis).toEqual(
      ['🚛'],
    );
    expect(
      moodOf({ speaker: 'alsu', text: 'Кирпич на поддонах.', kind: 'business' }).emojis,
    ).toEqual(['🧱']);
  });

  it('prices, estimates, weather, night, breaks, thanks, confirmations', () => {
    const e = (text: string, kind: 'business' | 'joke' = 'business', hour?: number) =>
      moodOf({ speaker: 'sveta', text, kind, hour }).emojis;
    expect(e('Час — 2 500 ₽ с машинистом.')).toContain('💰');
    expect(e('Прикину смету по размерам.')).toContain('🧮');
    expect(e('Дождь до вечера.')).toEqual(['🌧️']);
    expect(e('Мороз, всё прогреваем.')).toEqual(['❄️']);
    expect(e('Ветер 13 м/с.')).toEqual(['💨']);
    expect(e('Гроза идёт.')).toEqual(['⛈️']);
    expect(e('Туман с утра.')).toEqual(['🌫️']);
    expect(e('Тихо на площадке.', 'joke', 23)).toContain('🌙');
    expect(e('Обед! Термос и бутерброд.', 'joke')).toContain('☕');
    expect(e('Спасибо, что заглянули!')).toEqual(['🙏']);
    expect(e('Заявка принята, перезвоню.')).toEqual(['✅']);
    expect(moodOf({ speaker: 'sveta', text: 'Дождь до вечера.', kind: 'business' }).mood).toBe(
      'worried',
    );
  });

  it('radio lines get 📻 or the topic, one emoji', () => {
    const r = moodOf({ speaker: 'alsu', text: 'Света, приём! Как слышно?', kind: 'radio' });
    expect(r.mood).toBe('radio');
    expect(r.emojis).toEqual(['📻']);
    expect(
      moodOf({ speaker: 'alsu', text: 'Песок на завтра, два рейса.', kind: 'radio' }).emojis,
    ).toHaveLength(1);
  });

  it('never more than 2 emojis, 1 calm one on business lines, no flags', () => {
    const calmFaces = /[😄😂🤬😮🤔😴💪]/u;
    for (const speaker of Object.keys(LINES) as (keyof typeof LINES)[])
      for (const line of LINES[speaker].slice(0, 400))
        for (const kind of ['business', 'joke', 'radio'] as const) {
          const r = moodOf({ speaker, text: line.text, kind, hour: 23 });
          expect(r.emojis.length).toBeLessThanOrEqual(kind === 'joke' ? 2 : 1);
          if (kind === 'business') expect(r.emojis.join('')).not.toMatch(calmFaces);
          for (const em of r.emojis) {
            expect(FLAG.test(em)).toBe(false);
            expect(Object.values(EMOJIS)).toContain(em);
          }
        }
    for (const pair of RADIO_PAIRS)
      expect(
        moodOf({ speaker: pair.a, text: pair.aText, kind: 'radio' }).emojis.length,
      ).toBeLessThanOrEqual(1);
  });
});

describe('decorate', () => {
  it('puts emojis at the end, 👷/📻 at the start, at most 2', () => {
    expect(decorate('Привет', ['😄', '☕', '🚛'])).toBe('Привет 😄☕');
    expect(decorate('Приём', ['📻'])).toBe('📻 Приём');
  });
  it('leaves lines that already have an emoji', () => {
    expect(decorate('Гав! 🐶', ['😄'])).toBe('Гав! 🐶');
    expect(hasEmoji('Гав! 🐶')).toBe(true);
    expect(hasEmoji('Просто текст, 16 ₽')).toBe(false);
  });
});

describe('stripEmoji', () => {
  it('removes every emoji the page can show, keeps words and comic swearing', () => {
    expect(stripEmoji('👷 Здравствуйте!')).toBe('Здравствуйте!');
    expect(stripEmoji('Гав! 🐶')).toBe('Гав!');
    expect(stripEmoji('Дождь 🌧️, ветер 💨!')).toBe('Дождь, ветер!');
    expect(stripEmoji('С Днём строителя! 🏗️🎉 — СпецПласт16')).toBe(
      'С Днём строителя! — СпецПласт16',
    );
    expect(stripEmoji('Кто ковш поставил, #@%&! 🤬')).toBe('Кто ковш поставил, #@%&!');
    expect(stripEmoji('Ок 👍🏽 и 👨‍👩‍👧 и 1️⃣')).toBe('Ок и и 1');
    for (const em of Object.values(EMOJIS)) expect(hasEmoji(stripEmoji(`Текст ${em}`))).toBe(false);
  });
  it('spoken text of a decorated line has no emojis', () => {
    for (const speaker of Object.keys(LINES) as (keyof typeof LINES)[])
      for (const line of LINES[speaker].slice(0, 200)) {
        const shown = moodLine({ speaker, text: line.text, kind: 'joke', hour: 23 }).text;
        const spoken = stripEmoji(shown);
        expect(hasEmoji(spoken)).toBe(false);
        expect(spoken.replace(/\s/g, '')).toBe(stripEmoji(line.text).replace(/\s/g, ''));
      }
  });
});

describe('moodLine shows few emojis', () => {
  it('none on business and plain lines, at most one on a joke', () => {
    for (const speaker of Object.keys(LINES) as (keyof typeof LINES)[])
      for (const line of LINES[speaker].slice(0, 200)) {
        expect(moodLine({ speaker, text: line.text, kind: 'business', hour: 23 }).emojis).toEqual(
          [],
        );
        expect(
          moodLine({ speaker, text: line.text, kind: 'joke', hour: 23, plain: true }).emojis,
        ).toEqual([]);
        expect(
          moodLine({ speaker, text: line.text, kind: 'joke', hour: 23 }).emojis.length,
        ).toBeLessThanOrEqual(1);
      }
  });
});
