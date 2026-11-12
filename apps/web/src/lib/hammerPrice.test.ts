import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bidShiftFloor, customerRates, machineTypeOf } from './equipmentCatalog';
import { HOUSE_COMPANY_ID } from './fleet';
import { jobBySlug, jobRate } from './jobs';
import { landingBySlug, landingListRate } from './landings';
import { MACHINE_WORKS, workRate } from './machineWorks';
import { cardRates } from './offerBreakdown';
import {
  HAMMER_RATE,
  houseRate,
  PRICE_GROUPS,
  priceFaqAnswer,
  rateOf,
  RATES,
  SHIFT_HOURS,
} from './prices';

// «Гидромолот 4500» (owner, 2026-11-12): the wheeled excavator with the
// hydraulic hammer costs one price on every surface.
const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');

// The house row as the database holds it until the deploy raises it.
const stale = {
  name: 'Колёсный экскаватор с гидромолотом',
  categoryName: 'Экскаваторы колёсные',
  companyId: HOUSE_COMPANY_ID,
  hourlyRate: '4000.00',
  dailyRate: '32000.00',
};

describe('the wheeled excavator with the hammer costs 4 500 ₽/ч everywhere', () => {
  it('is the owner’s number in the price list', () => {
    expect(HAMMER_RATE).toBe(4500);
    expect(RATES['wheeled-excavator']).toBe(HAMMER_RATE);
    expect(rateOf('wheeled-excavator')).toBe(HAMMER_RATE);
    const group = PRICE_GROUPS.find((g) => g.types.includes('wheeled-excavator'))!;
    expect(group.rate).toBe(HAMMER_RATE);
    expect(group.names).toMatch(/колёсный экскаватор с гидромолотом/);
    expect(priceFaqAnswer()).toContain('колёсный экскаватор с гидромолотом');
  });

  it('agrees on the tile, the landing, the wizard and the job page', () => {
    const landing = landingBySlug('kolyosnyj-ekskavator-gidromolot')!;
    expect(landingListRate(landing)).toBe(HAMMER_RATE);
    expect(rateOf(landing.machine)).toBe(HAMMER_RATE);
    const works = MACHINE_WORKS['wheeled-excavator']!;
    expect(works.rate).toBe(HAMMER_RATE);
    for (const job of works.works) expect(workRate(works, job)).toBe(HAMMER_RATE);
    expect(jobRate(jobBySlug('demontazh')!)).toBe(HAMMER_RATE);
    // The home tile takes the same constant.
    expect(read('apps/web/src/app/page.tsx')).toContain('price: fromPerHour(HAMMER_RATE)');
  });

  it('agrees on cards, the machine page, offers and booking totals with a stale database row', () => {
    expect(machineTypeOf(stale.categoryName, stale.name)).toBe('wheeled-excavator');
    expect(houseRate(stale.hourlyRate, 'wheeled-excavator')).toBe(HAMMER_RATE);
    const rates = customerRates(stale);
    expect(rates.hourlyRate).toBe(HAMMER_RATE);
    // A booking is charged per shift: 8 hours at the list price.
    expect(rates.dailyRate).toBe(HAMMER_RATE * SHIFT_HOURS);
    expect(bidShiftFloor(stale)).toBe(HAMMER_RATE * SHIFT_HOURS);
    expect(cardRates(stale)).toEqual({ hour: HAMMER_RATE, shift: HAMMER_RATE * SHIFT_HOURS });
  });

  it('does not touch another provider’s wheeled excavator', () => {
    expect(customerRates({ ...stale, companyId: 'other' }).hourlyRate).toBe(4000);
  });

  it('keeps the backhoe at 4 000 with the hammer at 4 500', () => {
    expect(RATES.backhoe).toBe(4000);
    const backhoe = MACHINE_WORKS.backhoe!;
    expect(backhoe.rate).toBe(4000);
    expect(backhoe.hammerRate).toBe(HAMMER_RATE);
    expect(
      customerRates({
        name: 'Экскаватор-погрузчик JCB 4CX',
        categoryName: 'Экскаваторы-погрузчики',
        companyId: HOUSE_COMPANY_ID,
        hourlyRate: 4000,
        dailyRate: 32000,
      }).hourlyRate,
    ).toBe(4000);
  });

  it('is the price the deploy writes to the database and the Yandex card lists', () => {
    const fleet = read('packages/database/prisma/ensure-fleet.ts');
    expect(fleet).toContain(`const HAMMER_RATE = ${HAMMER_RATE};`);
    const row = fleet.slice(fleet.indexOf("id: 'sp16-excavator-wheeled'"));
    expect(row.slice(0, row.indexOf('}'))).toContain('hourlyRate: HAMMER_RATE,');
    // Raised only for that house machine and only from below.
    expect(fleet).toContain(
      'where: { id: HAMMER_MACHINE_ID, companyId: COMPANY_ID, hourlyRate: { lt: HAMMER_RATE } }',
    );
    const card = read('docs/yandex-business-card.md')
      .split('\n')
      .find((line) => line.startsWith('| Колёсный экскаватор'))!;
    expect(card).toContain('4 500 ₽');
    expect(card).not.toContain('4 000');
  });
});
