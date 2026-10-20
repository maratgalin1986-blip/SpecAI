import { describe, expect, it } from 'vitest';
import { rateText, type BaseMachine, type LiveMachine } from './linePresence';
import { OFFER_HOUSE_MAX, OFFER_LINE_POOL, offerCards } from './offerNow';

const live = (over: Partial<LiveMachine> & { house?: boolean; eq?: string }): LiveMachine => ({
  id: `p-${over.eq ?? 'x'}`,
  lat: 55.7432,
  lon: 52.3961,
  driver: 'Марат Г.',
  company: { id: 'c1', name: 'Стройтех', verified: true, isHouse: over.house ?? false },
  equipment: {
    id: over.eq ?? 'x',
    name: 'Экскаватор JCB 3CX',
    category: 'Экскаваторы-погрузчики',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 3000,
    dailyRate: 24000,
  },
  note: null,
  distanceKm: null,
  bubble: 'Я на линии · Экскаватор JCB 3CX · от 3 000 ₽/ч · Марат Г.',
  updatedAt: '2026-10-18T08:00:00.000Z',
  ...over,
});

const base = (id: string): BaseMachine => ({
  id,
  lat: 55.7,
  lon: 52.4,
  company: { name: 'СпецПласт16', isHouse: true },
  equipment: {
    id,
    name: `Манипулятор ${id}`,
    category: 'Краны-манипуляторы (КМУ)',
    categorySlug: 'crane-trucks',
    hourlyRate: 2500,
    dailyRate: 20000,
  },
  priceText: 'от 2 500 ₽/ч',
  distanceKm: null,
  bubble: 'СпецПласт16 · Манипулятор · от 2 500 ₽/ч · на базе',
});

describe('offerCards', () => {
  it('puts СпецПласт16 first (on the line, then at the base) and the others on the line after', () => {
    const { house, line } = offerCards(
      [live({ eq: 'other' }), live({ eq: 'mine', house: true })],
      [base('b1')],
    );
    expect(house.map((card) => card.id)).toEqual(['mine', 'b1']);
    expect(house.every((card) => card.who === 'СпецПласт16')).toBe(true);
    expect(house[0]!.live).toBe(true);
    expect(house[1]!.live).toBe(false);
    expect(line.map((card) => card.id)).toEqual(['other']);
    expect(line[0]).toMatchObject({
      who: null,
      price: rateText(3000),
      live: true,
      city: 'Набережные Челны',
    });
  });

  it('is public: no driver, company, phone position or presence id on the line', () => {
    const { line } = offerCards([live({ eq: 'other', lat: 55.7432, lon: 52.3961 })], []);
    // The city's centre, not the phone.
    expect(line[0]!.near).not.toEqual({ lat: 55.7432, lon: 52.3961 });
    expect(line[0]!.near).not.toBeNull();
    const json = JSON.stringify(line);
    expect(json).not.toContain('c1');
    expect(json).not.toContain('Марат');
    expect(json).not.toContain('Стройтех');
    expect(json).not.toContain('p-other');
    expect(json).not.toContain('55.7432');
    expect(json).not.toMatch(/\+7|8\d{10}/);
  });

  it('keeps a pool of machines on the line for the nearest-first sort', () => {
    const many = Array.from({ length: 80 }, (_, i) => live({ eq: `m${i}` }));
    expect(offerCards(many, []).line).toHaveLength(OFFER_LINE_POOL);
  });

  it('a machine far from any big city has no city and no point', () => {
    const { line } = offerCards([live({ eq: 'taiga', lat: 64.5, lon: 120.1 })], []);
    expect(line[0]).toMatchObject({ city: null, near: null });
  });

  it('prefills the form with the machine and its price, not the driver', () => {
    const { line, house } = offerCards([live({ eq: 'other' })], [base('b1')]);
    expect(line[0]!.prefill).toBe(`Нужна: Экскаватор JCB 3CX (на линии, ${rateText(3000)}).`);
    expect(line[0]!.prefill).not.toContain('Марат');
    expect(house[0]!.prefill).toBe('Нужна: Манипулятор b1 (СпецПласт16, от 2 500 ₽/ч).');
  });

  it('is empty when nobody is on the line, and keeps the house list short', () => {
    const many = Array.from({ length: 10 }, (_, i) => base(`b${i}`));
    const { house, line } = offerCards([], many);
    expect(line).toEqual([]);
    expect(house).toHaveLength(OFFER_HOUSE_MAX);
  });
});
