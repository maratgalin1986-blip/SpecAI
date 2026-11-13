import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINTS } from './hints';
import {
  ACCOUNT_PHONE_VISIBILITY,
  GUEST_PHONE_VISIBILITY,
  LEAD_PHONE_VISIBILITY,
  PHONE_VISIBILITY,
} from './phoneVisibility';
import { MIN_ORDER_HOURS, MIN_ORDER_TEXT, priceFaqAnswer, SHIFT_HOURS } from './prices';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

// «Кто увидит мой телефон» — one answer, true to what the code does.
describe('who sees the phone', () => {
  it('says what really happens to a guest order: the dispatcher and «Показать телефон»', () => {
    expect(GUEST_PHONE_VISIBILITY).toContain('не публикуется');
    expect(GUEST_PHONE_VISIBILITY).toContain('диспетчер СпецПласт16');
    expect(GUEST_PHONE_VISIBILITY).toContain('«Показать телефон»');
    expect(GUEST_PHONE_VISIBILITY).toContain('каждый показ записан');
    expect(ACCOUNT_PHONE_VISIBILITY).toContain('подтвердит бронь');
    expect(LEAD_PHONE_VISIBILITY).toContain('только диспетчер');
    expect(PHONE_VISIBILITY).toBe(`${GUEST_PHONE_VISIBILITY} ${ACCOUNT_PHONE_VISIBILITY}`);
  });

  it('is the same words in the hint, the guest form and the home page', () => {
    expect(HINTS['orders-guest'].text).toContain(GUEST_PHONE_VISIBILITY);
    expect(HINTS['order-customer'].text).toContain(ACCOUNT_PHONE_VISIBILITY);
    expect(read('components/GuestOrderForm.tsx')).toContain('{GUEST_PHONE_VISIBILITY}');
    expect(read('app/page.tsx')).toContain('{PHONE_VISIBILITY}');
    // The old, untrue «видят только исполнители» is gone from the form.
    expect(read('components/GuestOrderForm.tsx')).not.toContain('Телефон видят только исполнители');
  });

  it('keeps the providers’ rule («Анна П.») off the public part of /orders', () => {
    const orders = read('app/orders/page.tsx');
    expect(orders).not.toContain('Заказчик виден как «Анна П.»');
    expect(orders).toContain('viewerIsProvider');
  });
});

// Owner, 2026-11-13: the minimum order is 4 hours, then by the hour; the shift
// stays 8 hours as the unit of the «за смену» price.
describe('minimum order', () => {
  it('is one number and one wording', () => {
    expect(MIN_ORDER_HOURS).toBe(4);
    expect(SHIFT_HOURS).toBe(8);
    expect(MIN_ORDER_TEXT).toBe('Минимум 4 часа, дальше по часам');
    expect(priceFaqAnswer()).toContain(MIN_ORDER_TEXT);
  });

  it('names both crane prices on the home page, not «до 32 т» with the 25 t price', () => {
    const home = read('app/page.tsx');
    expect(home).not.toContain('до 32 т');
    expect(home).toContain('CRANE_HEAVY_RATE');
    // A category shared by two cards counts its free machines once.
    expect(home).toContain('FREE_COUNT_ON.has(service.title)');
  });

  it('replaced «оплата по факту» on the home page and the landings', () => {
    for (const path of [
      'app/page.tsx',
      'app/arenda/[slug]/page.tsx',
      'components/TrustBadges.tsx',
    ]) {
      expect(read(path), path).not.toMatch(/оплата по факту|отработанные часы/);
    }
  });
});
