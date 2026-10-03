import { describe, expect, it } from 'vitest';
import { DIALOGUE } from '@/lib/stroyka';
import { CENSOR, JOKES, pickJoke, splitCensored } from '@/lib/stroykaJokes';

describe('banter', () => {
  it('has 8–12 jokes per character', () => {
    for (const pool of Object.values(JOKES)) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(pool.length).toBeLessThanOrEqual(12);
    }
  });

  it('keeps Света, Ринат and the business lines free of «swearing»', () => {
    for (const line of [...JOKES.sveta, ...JOKES.rinat, ...JOKES.alsu])
      expect(line).not.toMatch(CENSOR);
    for (const node of Object.values(DIALOGUE)) {
      expect(node.text).not.toMatch(CENSOR);
      for (const reply of node.replies) expect(reply.label).not.toMatch(CENSOR);
    }
    expect(JOKES.mihalych.some((j) => /[#@%&$*!]{3,}/.test(j))).toBe(true);
  });

  it('censor runs use only the comic symbols', () => {
    for (const pool of Object.values(JOKES))
      for (const line of pool)
        for (const part of splitCensored(line))
          if (part.censored) expect(part.text).toMatch(/^[#@%&$*!]+$/);
  });

  it('splits a line for highlighting', () => {
    expect(splitCensored('Ну ёлки-$%#@, кабель же!')).toEqual([
      { text: 'Ну ёлки-', censored: false },
      { text: '$%#@', censored: true },
      { text: ', кабель же!', censored: false },
    ]);
    expect(splitCensored('чисто')).toEqual([{ text: 'чисто', censored: false }]);
  });

  it('does not repeat the last joke', () => {
    const last = JOKES.rinat[0]!;
    for (let i = 0; i < 20; i++) expect(pickJoke('rinat', last)).not.toBe(last);
  });
});
