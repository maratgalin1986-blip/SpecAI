import { describe, expect, it } from 'vitest';
import { awayFor, awayMessage, daysBetween, plural, snapshot } from '@/lib/stroyka/away';
import { progressFromUnits } from '@/lib/stroyka/progress';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T07:00:00Z'); // 10:00 MSK

describe('day counting and plurals', () => {
  it('counts Moscow calendar days', () => {
    expect(daysBetween(T0, T0 + 3 * 3_600_000)).toBe(0);
    expect(daysBetween(T0, T0 + 5 * DAY)).toBe(5);
    // 23:30 MSK → 00:30 MSK next day is one day.
    const late = Date.parse('2026-10-05T20:30:00Z');
    expect(daysBetween(late, late + 3_600_000)).toBe(1);
  });

  it('declines Russian nouns', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня');
    expect(plural(5, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(11, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(21, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(22, 'день', 'дня', 'дней')).toBe('дня');
    expect(awayFor(1)).toBe('1 день');
    expect(awayFor(5)).toBe('5 дней');
    expect(awayFor(21)).toBe('3 недели');
    expect(awayFor(35)).toBe('5 недель');
    expect(awayFor(90)).toBe('3 месяца');
  });
});

describe('«Пока вас не было»', () => {
  it('lists what was built over several days', () => {
    const before = snapshot(progressFromUnits(0.02), T0);
    const now = progressFromUnits(0.18 + 0.3 * 0.25);
    expect(awayMessage(before, now, T0 + 5 * DAY)).toBe(
      'Вас не было 5 дней. За это время: выкопали котлован, залили фундамент, подняли 3 этажа каркаса.',
    );
  });

  it('notices half a floor on the same day', () => {
    const before = snapshot(progressFromUnits(0.18 + 0.3 * 0.3), T0);
    const now = progressFromUnits(0.18 + 0.3 * 0.36);
    expect(awayMessage(before, now, T0 + 4 * 3_600_000)).toBe(
      'С возвращением! С утра подняли ещё полэтажа.',
    );
  });

  it('tells about a finished object after weeks away', () => {
    const before = snapshot(progressFromUnits(0.7), T0);
    const now = progressFromUnits(1.1);
    expect(awayMessage(before, now, T0 + 21 * DAY)).toBe(
      `Вас не было 3 недели — ЖК «Кама» уже сдали, начали ${now.projectName.charAt(0).toLowerCase() + now.projectName.slice(1)} по соседству.`,
    );
  });

  it('says nothing on a first visit', () => {
    expect(awayMessage(null, progressFromUnits(0.3), T0)).toBe(null);
  });
});
