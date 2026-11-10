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

describe('parseOfficeSettings — режим рассылки (К2)', () => {
  it('по умолчанию письма ждут утверждения владельцем', () => {
    expect(parseOfficeSettings([]).outreachMode).toBe('approve');
  });

  it('«auto» — только явно; всё остальное — утверждение', () => {
    const read = (value: string) =>
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.outreachMode, value }]).outreachMode;
    expect(read('auto')).toBe('auto');
    expect(read(' auto ')).toBe('auto');
    expect(read('approve')).toBe('approve');
    expect(read('1')).toBe('approve');
  });
});

describe('parseOfficeSettings — WhatsApp на мобильный из карточки', () => {
  it('по умолчанию включено (владелец, 2026-11-09: «оставили номера для связи — нужно связаться»)', () => {
    expect(parseOfficeSettings([]).whatsappToPhone).toBe(true);
  });

  it('владелец выключил флажок — выключено; включил — включено', () => {
    const at = (value: string) =>
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.whatsappToPhone, value }]).whatsappToPhone;
    expect(at('0')).toBe(false);
    expect(at('1')).toBe(true);
  });
});
