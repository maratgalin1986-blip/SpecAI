import { describe, expect, it } from 'vitest';
import { builderDay, seasonalEvent } from '@/lib/stroyka/seasonal';
import {
  applyBadge,
  BADGES,
  BADGES_KEY,
  emptyBadges,
  loadBadges,
  saveBadges,
  type BadgeState,
} from '@/lib/stroyka/badges';
import { photoCaption, photoFileName, photoLayout } from '@/lib/stroyka/photo';

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

describe('badges', () => {
  const zones = ['gate', 'kotlovan', 'sklad'] as const;
  it('earns «Обошёл весь объект» once every zone is visited, once', () => {
    let s: BadgeState = emptyBadges();
    for (const z of zones.slice(0, 2)) {
      const r = applyBadge(s, { type: 'zone', zone: z, all: zones });
      expect(r.earned).toEqual([]);
      s = r.state;
    }
    const r = applyBadge(s, { type: 'zone', zone: 'sklad', all: zones });
    expect(r.earned.map((b) => b.title)).toEqual(['Обошёл весь объект']);
    expect(applyBadge(r.state, { type: 'zone', zone: 'gate', all: zones }).earned).toEqual([]);
  });

  it('talk, night, rain, dog, order', () => {
    let s = emptyBadges();
    const all = ['mihalych', 'sveta'];
    s = applyBadge(s, { type: 'talk', speaker: 'mihalych', all }).state;
    expect(applyBadge(s, { type: 'talk', speaker: 'mihalych', all }).earned).toEqual([]);
    const talk = applyBadge(s, { type: 'talk', speaker: 'sveta', all });
    expect(talk.earned[0]!.id).toBe('talk');
    for (const type of ['night', 'rain', 'dog', 'order'] as const) {
      const r = applyBadge(s, { type });
      expect(r.earned[0]!.id).toBe(type);
      expect(applyBadge(r.state, { type }).earned).toEqual([]);
    }
    expect(BADGES.map((b) => b.title)).toContain('Нашёл Бетона');
    // Just for fun: no discounts or promises.
    for (const b of BADGES) expect(`${b.title} ${b.hint}`).not.toMatch(/скидк|%|бонус|подар/i);
  });

  it('storage never throws and ignores junk', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadBadges(bad)).toEqual(emptyBadges());
    expect(() => saveBadges(emptyBadges(), bad)).not.toThrow();
    expect(loadBadges(null)).toEqual(emptyBadges());
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    mem.set(BADGES_KEY, '{"earned":["dog","hack",3],"zones":"x"}');
    expect(loadBadges(store)).toEqual({ earned: ['dog'], zones: [], speakers: [] });
    saveBadges({ earned: ['night'], zones: ['gate'], speakers: [] }, store);
    expect(loadBadges(store).earned).toEqual(['night']);
    mem.set(BADGES_KEY, 'not json');
    expect(loadBadges(store)).toEqual(emptyBadges());
  });
});

describe('photo', () => {
  it('caption with the brand, Moscow date and host as text', () => {
    const c = photoCaption(msk(2026, 10, 2), 'https://spec-ai-web.vercel.app/stroyka');
    expect(c.title).toBe('Я на стройке ИИСтройка24 · СпецПласт16');
    expect(c.date).toBe('2 октября 2026');
    expect(c.site).toBe('spec-ai-web.vercel.app');
    expect(photoFileName(msk(2026, 10, 2, 23))).toBe('specplast16-stroyka-2026-10-02.png');
  });
  it('layout fits the photo and a caption band', () => {
    const l = photoLayout(2560, 1440);
    expect(l.photo.w).toBe(1600);
    expect(l.photo.h).toBe(900);
    expect(l.width).toBe(1600 + l.pad * 2);
    expect(l.height).toBe(900 + l.pad * 2 + l.band);
    expect(photoLayout(390, 664).photo.w).toBe(390);
  });
});
