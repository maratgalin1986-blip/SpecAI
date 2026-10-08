import { describe, expect, it } from 'vitest';
import { builderDay, seasonalEvent } from '@/lib/stroyka/seasonal';

// Noon in Moscow on a given day.
const msk = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h - 3));

describe('seasonalEvent', () => {
  it('New Year from 15 December to 14 January', () => {
    expect(seasonalEvent(msk(2026, 12, 14))).toBeNull();
    const dec = seasonalEvent(msk(2026, 12, 15))!;
    expect(dec.id).toBe('newyear');
    expect(dec.garland && dec.tree && dec.snow).toBe(true);
    expect(dec.lines[0]).toEqual({ speaker: 'mihalych', text: 'С наступающим! 🎄' });
    expect(seasonalEvent(msk(2027, 1, 14))!.id).toBe('newyear');
    expect(seasonalEvent(msk(2027, 1, 14))!.lines[0]!.text).toMatch(/С Новым годом/);
    expect(seasonalEvent(msk(2027, 1, 15))).toBeNull();
  });

  it('uses Moscow time at the day boundary', () => {
    // 14 Dec 22:00 UTC is already 15 Dec 01:00 in Moscow.
    expect(seasonalEvent(new Date(Date.UTC(2026, 11, 14, 22)))?.id).toBe('newyear');
  });

  it('День строителя: the second Sunday of August and the 3 days before it', () => {
    expect(builderDay(2026)).toBe(9);
    expect(builderDay(2027)).toBe(8);
    expect(builderDay(2025)).toBe(10);
    expect(seasonalEvent(msk(2026, 8, 5))).toBeNull();
    for (const d of [6, 7, 8, 9]) expect(seasonalEvent(msk(2026, 8, d))?.id).toBe('builder');
    expect(seasonalEvent(msk(2026, 8, 10))).toBeNull();
    const e = seasonalEvent(msk(2026, 8, 9))!;
    expect(e.banner).toBe('С Днём строителя! — СпецПласт16');
    expect(e.fireworks).toBe(true);
  });

  it('Сабантуй in late June, 8 March, 23 February', () => {
    expect(seasonalEvent(msk(2026, 6, 19))).toBeNull();
    const sab = seasonalEvent(msk(2026, 6, 27))!;
    expect(sab.id).toBe('sabantuy');
    expect(sab.flags).toBe(true);
    expect(sab.lines.some((l) => l.speaker === 'rinat')).toBe(true);
    const m8 = seasonalEvent(msk(2026, 3, 8))!;
    expect(m8.id).toBe('march8');
    expect(m8.flowers).toBe(true);
    expect(seasonalEvent(msk(2026, 3, 9))).toBeNull();
    expect(seasonalEvent(msk(2026, 2, 23))?.id).toBe('feb23');
    expect(seasonalEvent(msk(2026, 10, 2))).toBeNull();
  });

  it('lines are clean: full brand, no flags, no links', () => {
    for (let day = 0; day < 366; day++) {
      const e = seasonalEvent(new Date(Date.UTC(2026, 0, 1 + day, 9)));
      if (!e) continue;
      for (const text of [...e.lines.map((l) => l.text), e.banner ?? '']) {
        expect(text).not.toMatch(/СП16|https?:|www\./);
        expect(text).not.toMatch(/\p{Regional_Indicator}/u);
      }
    }
  });
});
