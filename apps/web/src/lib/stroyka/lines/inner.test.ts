import { describe, expect, it } from 'vitest';
import { RECORDED_SPEAKERS, voiceKey } from '../voice';
import { VOICE_CLIPS } from '../voiceClips';
import { LINES } from './index';
import { INNER, INNER_GAP_MS, INNER_LINES, innerTurn, pickInner } from './inner';

const noon = { hour: 12, weekday: 2 };
const first = () => 0;

describe('inner lines', () => {
  it('gives every main character a few', () => {
    for (const speaker of ['mihalych', 'rinat', 'ildar', 'sveta', 'alsu'] as const) {
      expect(INNER[speaker].length).toBeGreaterThanOrEqual(4);
    }
  });

  it('marks the unrecorded lines of recorded speakers as text only', () => {
    for (const line of INNER_LINES) {
      const recorded = (RECORDED_SPEAKERS as readonly string[]).includes(line.speaker);
      if (recorded && !VOICE_CLIPS[voiceKey(line.text)]) expect(line.voiced, line.id).toBe(false);
      if (!recorded) expect(line.voiced, line.id).toBe(true);
    }
  });

  it('stays out of LINES, so the voice test does not need clips for them', () => {
    const texts = new Set(Object.values(LINES).flatMap((l) => l.map((x) => x.text)));
    expect(INNER_LINES.filter((l) => texts.has(l.text))).toEqual([]);
  });

  it('never repeats and tells Михалыч’s concrete story in order', () => {
    const said = new Set<string>();
    const order: string[] = [];
    for (let i = 0; i < 20; i++) {
      const line = pickInner('mihalych', said, noon, first);
      if (!line) break;
      said.add(line.id);
      order.push(line.id);
    }
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(INNER.mihalych.length);
    const steps = order.filter((id) => id.includes('concrete'));
    expect(steps).toEqual([
      'mihalych-inner-concrete-1',
      'mihalych-inner-concrete-2',
      'mihalych-inner-concrete-3',
      'mihalych-inner-concrete-4',
    ]);
    expect(pickInner('mihalych', said, noon)).toBeNull();
  });

  it('waits for the worry before the relief', () => {
    const relief = INNER.mihalych.find((l) => l.id.endsWith('concrete-3'))!;
    for (let i = 0; i < 30; i++) {
      const line = pickInner('mihalych', new Set(), noon, () => i / 30);
      expect(line?.id).not.toBe(relief.id);
    }
  });

  it('bakes on Fridays and promises on other days', () => {
    const friday = new Set(
      Array.from(
        { length: 20 },
        (_, i) => pickInner('alsu', new Set(), { hour: 12, weekday: 5 }, () => i / 20)?.id,
      ),
    );
    expect(friday.has('alsu-inner-echpochmak-1')).toBe(true);
    expect(friday.has('alsu-inner-echpochmak-3')).toBe(false);
    const monday = new Set(
      Array.from(
        { length: 20 },
        (_, i) => pickInner('alsu', new Set(), { hour: 12, weekday: 1 }, () => i / 20)?.id,
      ),
    );
    expect(monday.has('alsu-inner-echpochmak-1')).toBe(false);
    expect(monday.has('alsu-inner-echpochmak-3')).toBe(true);
  });

  it('comes up rarely', () => {
    expect(innerTurn(null, 0, () => 0.1)).toBe(true);
    expect(innerTurn(null, 0, () => 0.9)).toBe(false);
    expect(innerTurn(1000, 1000 + INNER_GAP_MS - 1, () => 0)).toBe(false);
    expect(innerTurn(1000, 1000 + INNER_GAP_MS, () => 0)).toBe(true);
  });

  it('keeps the brand right and invents no prices', () => {
    for (const line of INNER_LINES) {
      expect(line.text).not.toMatch(/СП16|₽|руб/);
    }
  });
});
