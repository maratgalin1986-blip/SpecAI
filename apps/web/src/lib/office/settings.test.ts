import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import {
  DEFAULT_AI_DAILY_CAP,
  DEFAULT_OUTREACH_MODE,
  DEFAULT_VAT_RATE,
  OFFICE_EXTRA_SETTINGS,
  parseOfficeSettings,
  parseVatRate,
} from './settings';

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
  it('по умолчанию офис отправляет сам (владелец, 2026-11-11: «Начинай отправку сам уже»)', () => {
    expect(DEFAULT_OUTREACH_MODE).toBe('auto');
    expect(parseOfficeSettings([]).outreachMode).toBe('auto');
    // Пустая строка в базе — тоже «не выбирал».
    expect(
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.outreachMode, value: '  ' }]).outreachMode,
    ).toBe('auto');
  });

  it('выбор владельца сохраняется; непонятное значение — утверждение, а не отправка', () => {
    const read = (value: string) =>
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.outreachMode, value }]).outreachMode;
    expect(read('auto')).toBe('auto');
    expect(read(' auto ')).toBe('auto');
    expect(read('approve')).toBe('approve');
    expect(read('1')).toBe('approve');
    expect(read('AUTO')).toBe('approve');
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

describe('parseOfficeSettings — ставка НДС в счёте (К8)', () => {
  it('по умолчанию 22 %; сохранённая — только из списка, 0 — «НДС не облагается»', () => {
    expect(DEFAULT_VAT_RATE).toBe(22);
    expect(parseOfficeSettings([]).vatRate).toBe(22);
    const at = (value: string) =>
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.vatRate, value }]).vatRate;
    expect(at('0')).toBe(0);
    expect(at('5')).toBe(5);
    expect(at(' 20 ')).toBe(20);
    // Мусор и ставка не из списка — по умолчанию, а не «без НДС».
    for (const bad of ['', 'abc', '18', '-1']) expect(at(bad)).toBe(22);
    expect(parseVatRate(undefined)).toBe(22);
  });
});

describe('parseOfficeSettings — адрес для ответов', () => {
  it('по умолчанию пусто: ответы приходят в ящик, с которого ушло письмо', () => {
    expect(parseOfficeSettings([]).replyTo).toBe('');
  });

  it('сохранённый владельцем адрес остаётся', () => {
    expect(
      parseOfficeSettings([{ key: 'office.replyTo', value: ' owner@example.ru ' }]).replyTo,
    ).toBe('owner@example.ru');
  });
});

describe('WhatsApp сам по расписанию (владелец, 2026-11-13: «пока без WhatsApp»)', () => {
  it('по умолчанию выключен; включает только сохранённая настройка', () => {
    expect(parseOfficeSettings([]).whatsappAuto).toBe(false);
    expect(
      parseOfficeSettings([{ key: OFFICE_EXTRA_SETTINGS.whatsappAuto, value: '1' }]).whatsappAuto,
    ).toBe(true);
  });
});
