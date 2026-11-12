import { describe, expect, it } from 'vitest';
import { landingBySlug } from './landings';
import { formLabel } from './marketing';
import { fromPerHour, fromPrice, RATES, rub } from './prices';
import {
  HOUSE_DELIVERY_PROMISE,
  isSnowSeason,
  SNEG_AUDIENCE,
  SNEG_MACHINES,
  SNEG_STEPS,
  snegFaq,
  snegPackage,
  snegPackageLine,
} from './sneg';
import { SNEG_SOURCE, snegLeadMessage } from './snegLead';

describe('SNEG_MACHINES', () => {
  it('names only machines that have a price and a page: loader, dump truck, tractor', () => {
    expect(SNEG_MACHINES.map((m) => m.type)).toEqual(['loader', 'truck', 'tractor']);
    for (const machine of SNEG_MACHINES) {
      expect(RATES[machine.type], machine.type).toBeGreaterThan(0);
      expect(landingBySlug(machine.landing)?.machine, machine.landing).toBe(machine.type);
    }
  });
  it('puts the loader and the dump truck in the package, not the tractor', () => {
    expect(SNEG_MACHINES.filter((m) => m.inPackage).map((m) => m.type)).toEqual([
      'loader',
      'truck',
    ]);
  });
});

describe('snegPackage', () => {
  it('is the two hourly prices of the price list added up, nothing else', () => {
    const pack = snegPackage();
    expect(pack.loader).toBe(RATES.loader);
    expect(pack.truck).toBe(RATES.truck);
    expect(pack.total).toBe(RATES.loader + RATES.truck);
  });
  it('reads each machine as «от … ₽/ч с машинистом»', () => {
    expect(snegPackageLine()).toBe(
      `погрузчик — ${fromPerHour('loader')}, самосвал — ${fromPerHour('truck')}`,
    );
  });
});

describe('texts', () => {
  const all = [
    ...SNEG_AUDIENCE.flatMap((a) => [a.title, a.text]),
    ...SNEG_STEPS.flatMap((s) => [s.title, s.text]),
    ...snegFaq().flatMap((f) => [f.q, f.a]),
    ...SNEG_MACHINES.map((m) => m.role),
  ].join(' ');

  it('names all six audiences', () => {
    expect(SNEG_AUDIENCE.map((a) => a.title)).toEqual([
      'Управляющие компании',
      'ТСЖ',
      'Магазины',
      'Склады',
      'Частные дворы',
      'Администрации',
    ]);
  });
  it('promises delivery within two hours in Челны only', () => {
    expect(HOUSE_DELIVERY_PROMISE).toBe('Подача по Челнам в течение 2 часов');
    expect(snegFaq().find((f) => f.q.includes('не в Набережных'))?.a).toContain(
      'исполнители вашего города',
    );
  });
  it('has no ruble figure that is not a price-list price or the package sum', () => {
    const allowed = new Set(
      [RATES.loader, RATES.truck, RATES.tractor, snegPackage().total].map(rub),
    );
    const found = [...all.matchAll(new RegExp('(\\d[\\d\\u00a0 ]*)\\u00a0₽', 'g'))].map(
      (m) => m[1]!,
    );
    expect(found.length).toBeGreaterThan(0);
    for (const figure of found) expect(allowed.has(figure), figure).toBe(true);
    expect(all).toContain(fromPrice(snegPackage().total));
  });
  it('has no grader, no AI promise, no superlatives', () => {
    expect(all).not.toMatch(/грейдер|ИИ-|нейросет|гарантир|лучш|самые низкие|кабинет/i);
    expect(all).toContain('диспетчер');
  });
});

describe('isSnowSeason', () => {
  it('is November to March by the Moscow date', () => {
    expect(isSnowSeason(new Date('2026-11-12T09:00:00Z'))).toBe(true);
    expect(isSnowSeason(new Date('2027-01-15T09:00:00Z'))).toBe(true);
    expect(isSnowSeason(new Date('2027-03-31T12:00:00Z'))).toBe(true);
    expect(isSnowSeason(new Date('2027-04-01T12:00:00Z'))).toBe(false);
    expect(isSnowSeason(new Date('2026-07-01T12:00:00Z'))).toBe(false);
  });
  it('switches at Moscow midnight, not UTC', () => {
    // 31 October 21:00 UTC is already 1 November in Moscow.
    expect(isSnowSeason(new Date('2026-10-31T20:59:00Z'))).toBe(false);
    expect(isSnowSeason(new Date('2026-10-31T21:00:00Z'))).toBe(true);
    // 31 March 21:00 UTC is 1 April in Moscow.
    expect(isSnowSeason(new Date('2027-03-31T21:00:00Z'))).toBe(false);
  });
});

describe('snegLeadMessage', () => {
  it('always says what the lead is about and adds the optional fields', () => {
    expect(snegLeadMessage({})).toBe('Уборка снега');
    expect(snegLeadMessage({ address: '  пр. Мира, 1 ', what: '' })).toBe(
      'Уборка снега\nАдрес: пр. Мира, 1',
    );
    expect(snegLeadMessage({ address: 'пр. Мира, 1', what: 'парковка' })).toBe(
      'Уборка снега\nАдрес: пр. Мира, 1\nЧто убрать: парковка',
    );
  });
  it('fits the lead API (1000 characters)', () => {
    expect(snegLeadMessage({ address: 'а'.repeat(900), what: 'б'.repeat(900) })).toHaveLength(1000);
  });
});

describe('the lead source', () => {
  it('reads as «Уборка снега» in /admin/leads', () => {
    expect(SNEG_SOURCE).toBe('sneg');
    expect(formLabel('sneg')).toBe('Уборка снега');
  });
});
