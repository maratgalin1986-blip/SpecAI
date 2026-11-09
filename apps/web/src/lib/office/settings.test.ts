import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import { DEFAULT_AI_DAILY_CAP, OFFICE_EXTRA_SETTINGS, parseOfficeSettings } from './settings';

describe('parseOfficeSettings — ИИ-аналитик (U2)', () => {
  it('off with the default cap of 30 when nothing is saved', () => {
    const s = parseOfficeSettings([]);
    expect(s.aiOffers).toBe(false);
    expect(s.aiDailyCap).toBe(DEFAULT_AI_DAILY_CAP);
    expect(DEFAULT_AI_DAILY_CAP).toBe(30);
  });

  it('reads the switch and the cap; a broken cap falls back, a huge one is clamped to 500', () => {
    const read = (aiOffers: string, aiDailyCap: string) =>
      parseOfficeSettings([
        { key: OFFICE_EXTRA_SETTINGS.aiOffers, value: aiOffers },
        { key: OFFICE_EXTRA_SETTINGS.aiDailyCap, value: aiDailyCap },
      ]);
    expect(read('1', '12')).toMatchObject({ aiOffers: true, aiDailyCap: 12 });
    expect(read('0', '0')).toMatchObject({ aiOffers: false, aiDailyCap: 0 });
    expect(read('1', 'много').aiDailyCap).toBe(30);
    expect(read('1', '-3').aiDailyCap).toBe(30);
    expect(read('1', '9000').aiDailyCap).toBe(500);
  });
});
