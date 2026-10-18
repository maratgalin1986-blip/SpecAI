import { describe, expect, it } from 'vitest';
import {
  categoryKeyboard,
  cityKeyboard,
  isPriceStart,
  parsePriceCallback,
  priceIntroText,
  priceKeyboard,
  pricesFor,
  priceSurveyLink,
} from './botPrices';
import { machineKeyboard, parseCallback } from './botFunnel';
import { CITIES } from './cities';
import { LANDINGS } from './landings';

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('the bot’s price survey', () => {
  it('starts from /ceny, the deep link and the menu button of the greeting', () => {
    expect(isPriceStart('/ceny')).toBe(true);
    expect(isPriceStart('/ceny@specplast16_zayavki_bot')).toBe(true);
    expect(isPriceStart('/start ceny')).toBe(true);
    expect(isPriceStart('/start arenda-ceny')).toBe(false);
    expect(isPriceStart('/start')).toBe(false);
    expect(priceSurveyLink('bot')).toBe('https://t.me/bot?start=ceny');
    const button = machineKeyboard('home')
      .inline_keyboard.flat()
      .find((b) => b.callback_data === 'c');
    expect(button?.text).toBe('💰 Цены на технику');
    expect(parsePriceCallback('c')).toEqual({ step: 'start' });
    // The order funnel does not take the survey's buttons for its own.
    expect(parseCallback('c')).toBeNull();
    expect(parseCallback('cv|0|0|3000')).toBeNull();
  });

  it('asks openly as the platform, no name or phone needed', () => {
    expect(priceIntroText()).toContain('открытый опрос ИИСтройка24');
    expect(priceIntroText()).toContain('имя и телефон не нужны');
  });

  it('every button fits Telegram’s 64 bytes and reads back', () => {
    const all = [
      ...categoryKeyboard().inline_keyboard.flat(),
      ...cityKeyboard(LANDINGS.length - 1, 99).inline_keyboard.flat(),
      ...priceKeyboard(LANDINGS.length - 1, CITIES.length - 1).inline_keyboard.flat(),
    ];
    for (const button of all) {
      expect(bytes(button.callback_data), button.callback_data).toBeLessThanOrEqual(64);
      expect(parsePriceCallback(button.callback_data), button.callback_data).not.toBeNull();
    }
  });

  it('walks machine → cities (paged) → price, and refuses junk', () => {
    expect(parsePriceCallback('cc|0')).toEqual({ step: 'category', landing: 0 });
    expect(parsePriceCallback('cg|0|1')).toEqual({ step: 'cities', landing: 0, page: 1 });
    expect(parsePriceCallback('cs|0|3')).toEqual({ step: 'city', landing: 0, city: 3 });
    expect(parsePriceCallback('cv|0|3|3000')).toEqual({
      step: 'price',
      landing: 0,
      city: 3,
      price: 3000,
    });
    // A price that is not one of the buttons, an unknown machine or city.
    expect(parsePriceCallback('cv|0|3|3001')).toBeNull();
    expect(parsePriceCallback('cv|0|3|1')).toBeNull();
    expect(parsePriceCallback('cc|99')).toBeNull();
    expect(parsePriceCallback(`cs|0|${CITIES.length}`)).toBeNull();
    expect(parsePriceCallback('cg|0|999')).toBeNull();
    expect(parsePriceCallback('cv|0|3|-5')).toBeNull();
    // The first page has «Другие города», the last «Назад».
    expect(cityKeyboard(0).inline_keyboard.flat().at(-1)!.text).toBe('Другие города ›');
    const pages = Math.ceil(CITIES.length / 12);
    expect(
      cityKeyboard(0, pages - 1)
        .inline_keyboard.flat()
        .at(-1)!.text,
    ).toBe('‹ Назад');
  });

  it('offers only prices within the machine’s sane bounds', () => {
    for (const index of LANDINGS.keys()) {
      expect(pricesFor(index).every((price) => price >= 500 && price <= 60_000)).toBe(true);
      expect(pricesFor(index).length).toBeGreaterThan(5);
    }
  });
});
