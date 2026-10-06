import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDINGS } from './landings';
import { MACHINE_WORKS } from './machineWorks';
import {
  FEED_CLIPS,
  MINI_APP_MACHINES,
  feedFiles,
  feedItems,
  machineByType,
  miniAppSource,
  orderMessage,
  phoneOk,
  priceLine,
  sanitizeStartParam,
} from './miniApp';
import { RATES, SHIFT_HOURS } from './prices';

const PUBLIC = join(__dirname, '..', '..', 'public');
/** Prices use no-break spaces; compare them as plain ones. */
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('mini app feed', () => {
  it('references only files that exist', () => {
    const items = feedItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const file of feedFiles(item)) {
        expect(existsSync(join(PUBLIC, file)), file).toBe(true);
      }
    }
  });

  it('captions clips with the site’s own job list', () => {
    for (const { type, work } of FEED_CLIPS) {
      expect(MACHINE_WORKS[type]?.works, `${type}: ${work}`).toContain(work);
      expect(machineByType(type), type).toBeDefined();
    }
  });

  it('lists catalogue photos that exist', () => {
    for (const machine of MINI_APP_MACHINES) {
      expect(existsSync(join(PUBLIC, machine.photo)), machine.photo).toBe(true);
    }
  });
});

describe('mini app prices', () => {
  it('follow lib/prices.ts', () => {
    expect(MINI_APP_MACHINES.map((m) => m.slug)).toEqual(LANDINGS.map((l) => l.slug));
    for (const machine of MINI_APP_MACHINES) {
      expect(machine.rate).toBe(RATES[machine.type]);
      const { hour, shift } = priceLine(machine.type);
      const digits = (text: string) => Number(text.replace(/\D/g, ''));
      expect(digits(hour)).toBe(RATES[machine.type]);
      expect(digits(shift)).toBe(RATES[machine.type] * SHIFT_HOURS);
    }
  });

  it('shows the dump truck as «от 3 300 ₽/ч», shift «от 26 400 ₽»', () => {
    const { hour, shift } = priceLine('truck');
    expect([plain(hour), plain(shift)]).toEqual(['от 3 300 ₽/ч', 'от 26 400 ₽']);
  });

  it('puts the price into the lead text', () => {
    const machine = MINI_APP_MACHINES.find((m) => m.type === 'crane')!;
    const text = plain(orderMessage({ machine, when: 'Завтра', where: 'Елабуга' }));
    expect(text).toContain('Автокран');
    expect(text).toContain('Когда: Завтра');
    expect(text).toContain('Где: Елабуга');
    expect(text).toContain('от 4 500 ₽/ч');
    expect(text).toContain('смена 8 ч от 36 000 ₽');
  });
});

describe('start_param', () => {
  it('keeps only what Telegram allows, up to 64 characters', () => {
    expect(sanitizeStartParam('arenda-samosval__direct_1')).toBe('arenda-samosval__direct_1');
    expect(sanitizeStartParam('a b<script>/?=&;')).toBe('abscript');
    expect(sanitizeStartParam('Привет-1')).toBe('-1');
    expect(sanitizeStartParam('x'.repeat(100))).toHaveLength(64);
    expect(sanitizeStartParam(undefined)).toBe('');
    expect(sanitizeStartParam(42)).toBe('');
  });

  it('goes into the lead source', () => {
    expect(miniAppSource('')).toBe('tg-miniapp');
    expect(miniAppSource(undefined)).toBe('tg-miniapp');
    expect(miniAppSource('home__vk')).toBe('tg-miniapp:home__vk');
    expect(miniAppSource('<>')).toBe('tg-miniapp');
  });
});

describe('phone check', () => {
  it('needs 10–15 digits', () => {
    expect(phoneOk('+7 (927) 242-80-88')).toBe(true);
    expect(phoneOk('8927242')).toBe(false);
    expect(phoneOk('1'.repeat(16))).toBe(false);
  });
});
