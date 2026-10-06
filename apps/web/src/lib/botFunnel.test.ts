import { describe, expect, it } from 'vitest';
import { LANDINGS } from './landings';
import { rateOf, SHIFT_HOURS } from './prices';
import {
  calcText,
  draftMessage,
  machineKeyboard,
  parseCalcStart,
  parseCallback,
  phoneFromText,
  placeKeyboard,
  priceLine,
  reminderText,
  shortSource,
  whenKeyboard,
} from './botFunnel';

const truck = LANDINGS.findIndex((l) => l.machine === 'truck');
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
const sp = (s: string) => s.replace(/\u00a0/g, ' ');

describe('bot funnel', () => {
  it('keeps every callback within the 64 bytes Telegram allows', () => {
    const src = 'arenda-kolyosnyj-ekskavator-gidromolot__master-2026__y1234567890123'.slice(0, 30);
    const all = [
      ...machineKeyboard(src).inline_keyboard.flat(),
      ...whenKeyboard(10, src).inline_keyboard.flat(),
      ...placeKeyboard(10, 'x', src).inline_keyboard.flat(),
    ];
    for (const b of all) expect(bytes(b.callback_data), b.callback_data).toBeLessThanOrEqual(64);
  });

  it('walks machine → when → place and refuses junk', () => {
    expect(parseCallback(`m|${truck}|home`)).toEqual({
      step: 'machine',
      machine: truck,
      src: 'home',
    });
    expect(parseCallback(`w|${truck}|1|home`)).toMatchObject({ step: 'when', when: '1' });
    expect(parseCallback(`p|${truck}|1|2|home`)).toMatchObject({ step: 'place', city: 2 });
    expect(parseCallback('u')).toEqual({ step: 'unsubscribe' });
    for (const bad of ['m|99|x', 'w|0|9|x', 'p|0|1|9|x', 'zzz', undefined]) {
      expect(parseCallback(bad)).toBe(null);
    }
  });

  it('quotes prices only from lib/prices.ts', () => {
    const rate = rateOf('truck');
    expect(rate).toBe(3300);
    expect(sp(priceLine(truck))).toBe(
      `от 3 300 ₽/ч с машинистом, смена ${SHIFT_HOURS} ч — от 26 400 ₽`,
    );
    expect(sp(calcText(truck, 5))).toContain('5 ч × 3 300 ₽ = 16 500 ₽');
    expect(sp(priceLine(truck))).not.toMatch(/2 ?300|2 ?500|3 ?000 ₽/);
  });

  it('reads the calculator hand-off', () => {
    expect(parseCalcStart(`calc_${truck}_8__direct`)).toEqual({
      machine: truck,
      hours: 8,
      hammer: false,
    });
    expect(parseCalcStart(`calc_${truck}_4_h`)).toMatchObject({ hammer: true });
    expect(parseCalcStart('calc_99_8')).toBe(null);
    expect(parseCalcStart('calc_0_0')).toBe(null);
  });

  it('marks the draft with the chat and reads phones typed as text', () => {
    const draft = draftMessage(
      { step: 'place', machine: truck, when: '0', city: 1, src: 'home' },
      42,
    );
    expect(draft).toContain('[tg:42]');
    expect(draft).toContain('Елабуга');
    expect(phoneFromText('+7 927 242-80-88')).toBe('+7 927 242-80-88');
    expect(phoneFromText('нужен самосвал 12345')).toBe(null);
  });

  it('never says «СП16»', () => {
    expect(
      machineKeyboard('home')
        .inline_keyboard.flat()
        .map((b) => b.text)
        .join(' '),
    ).not.toMatch(/СП16/);
  });

  it('keeps the yclid when the source is shortened', () => {
    const long = 'arenda-kolyosnyj-ekskavator-gidromolot-elabuga__master-2026__y1234567890123';
    const short = shortSource(long);
    expect(short.length).toBeLessThanOrEqual(48);
    expect(short.endsWith('__y1234567890123')).toBe(true);
  });

  it('reminds with the chosen machine and price', () => {
    const draft = draftMessage(
      { step: 'place', machine: truck, when: '1', city: 1, src: 'home' },
      7,
    );
    expect(reminderText(draft)).toMatch(/^Вы выбирали самосвал, завтра, Елабуга — от 3/);
  });
});
