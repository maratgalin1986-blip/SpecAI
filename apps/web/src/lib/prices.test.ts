import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDINGS } from './landings';
import { MACHINE_WORKS } from './machineWorks';
import {
  CRANE_HEAVY_RATE,
  fromPrice,
  HAMMER_RATE,
  MIN_RATE,
  PRICE_GROUPS,
  priceFaqAnswer,
  RATES,
  rub,
} from './prices';

const faqOf = (slug: string) =>
  LANDINGS.find((l) => l.slug === slug)!
    .faq.map((f) => f.a)
    .join(' ');

describe('prices', () => {
  it('holds the owner prices of 2026-10-02', () => {
    expect(RATES.truck).toBe(3300);
    expect(RATES.agp).toBe(3500);
    expect(RATES.tractor).toBe(3500);
    expect(RATES.crane).toBe(4500);
    expect(CRANE_HEAVY_RATE).toBe(5500);
    expect(HAMMER_RATE).toBe(4500);
    expect(RATES.backhoe).toBe(4000);
    expect(MIN_RATE).toBe(3300);
  });

  it('formats rubles with a no-break space', () => {
    expect(rub(4000)).toBe('4 000');
    expect(fromPrice('crane')).toBe('от 4 500 ₽/ч');
  });

  it('names together only machines that share a price', () => {
    for (const group of PRICE_GROUPS) {
      for (const type of group.types) expect(RATES[type], type).toBe(group.rate);
    }
  });

  it('puts every rate into the home FAQ answer', () => {
    const answer = priceFaqAnswer();
    for (const rate of [...Object.values(RATES), HAMMER_RATE, CRANE_HEAVY_RATE]) {
      expect(answer).toContain(rub(rate));
    }
  });

  it('keeps landing FAQ prices in step with RATES', () => {
    expect(faqOf('ekskavator-pogruzchik')).toContain(rub(RATES.backhoe));
    expect(faqOf('ekskavator-pogruzchik')).toContain(rub(HAMMER_RATE));
    expect(faqOf('avtokran')).toContain(rub(RATES.crane));
    expect(faqOf('avtokran')).toContain(rub(CRANE_HEAVY_RATE));
    expect(faqOf('frontalnyj-pogruzchik')).toContain(rub(RATES.loader));
    expect(faqOf('traktor')).toContain(rub(RATES.tractor));
    for (const landing of LANDINGS) {
      for (const f of landing.faq) expect(f.a).not.toMatch(/\d \d{3} ₽/);
    }
  });

  it('gives every landing the price of its own machine', () => {
    for (const landing of LANDINGS) {
      expect(MACHINE_WORKS[landing.machine]?.landing, landing.slug).toBe(landing.slug);
      expect(fromPrice(landing.machine)).toBe(`от ${rub(RATES[landing.machine])} ₽/ч`);
    }
  });

  it('feeds the machine works (wizard, estimate, /stroyka)', () => {
    for (const [type, works] of Object.entries(MACHINE_WORKS)) {
      expect(works!.rate, type).toBe(RATES[type as keyof typeof RATES]);
    }
  });

  it('leaves no hard-coded price on the home page and in the layout', () => {
    for (const file of ['../app/page.tsx', '../app/layout.tsx']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source, file).not.toMatch(/\d[  ]?\d{3} ?₽/);
    }
    expect(readFileSync(join(__dirname, '../app/page.tsx'), 'utf8')).toContain('priceFaqAnswer()');
  });
});
