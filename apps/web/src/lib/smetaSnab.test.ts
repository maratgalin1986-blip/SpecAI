import { describe, expect, it } from 'vitest';
import { buildSmeta, rateOf } from './smeta';
import {
  ageDays,
  freshPrice,
  MARKUP_LARGE,
  MARKUP_MEDIUM,
  MARKUP_SMALL,
  markupRate,
  MAX_PRICE_AGE_DAYS,
  materialPrice,
  nicePrice,
  type PriceTable,
} from './smetaPrices';
import { buildProject } from './smetaProject';
import {
  csvField,
  jobSnab,
  priceRows,
  projectQuantities,
  projectSnab,
  snabCsv,
  snabRow,
  snabText,
  trips,
  UNPRICED,
  visibleSnabRows,
} from './smetaSnab';

const today = new Date(2026, 9, 2); // 02.10.2026
const ref = (low: number, high: number, checkedAt: string) => ({
  low,
  high,
  publisher: 'завод «Тест»',
  url: 'https://example.test/price',
  publishedAt: checkedAt,
  checkedAt,
});
const prices: PriceTable = {
  concrete: ref(6000, 7000, '2026-09-28'),
  sand: ref(700, 900, '2026-09-01'), // a month old: not used
};

describe('quantities by foundation', () => {
  const base = { object: 'house', length: 10, width: 8, floors: 2 } as const;
  it('strip: concrete, rebar, sand cushion, formwork, waterproofing, blocks', () => {
    const q = projectQuantities(buildProject({ ...base, foundation: 'strip' }));
    // Strip 46 m × 0.4 × 1.8 = 33.1 m³; 80 kg/m³ of rebar.
    expect(q.concrete).toBeCloseTo(33.1, 1);
    expect(q.rebar).toBeCloseTo(2.65, 2);
    expect(q.sand).toBeCloseTo(46 * 0.8 * 0.2);
    expect(q.formwork).toBeCloseTo(2 * 46 * 1.8);
    expect(q.stone).toBeUndefined();
    // 36 m × 6 m × 0.3 m, minus 15% openings.
    expect(q.blocks).toBeCloseTo(36 * 6 * 0.3 * 0.85);
  });
  it('slab: 0.3 m slab on sand and crushed stone over geotextile', () => {
    const q = projectQuantities(buildProject({ ...base, foundation: 'slab' }));
    expect(q.concrete).toBeCloseTo(24);
    expect(q.rebar).toBeCloseTo(2.4);
    expect(q.sand).toBeCloseTo(24);
    expect(q.stone).toBeCloseTo(12);
    expect(q.geotextile).toBeCloseTo(80);
  });
  it('piles: a light grillage, no cushion', () => {
    const q = projectQuantities(buildProject({ ...base, foundation: 'piles' }));
    expect(q.concrete).toBeCloseTo(46 * 0.5 * 0.4);
    expect(q.sand).toBeUndefined();
  });
  it('a trench job needs pipe and sand bedding; a crane job nothing', () => {
    const trench = jobSnab(buildSmeta('trench')!, { length: 30 }, today);
    expect(trench.rows.find((r) => r.material === 'pipe')!.base).toBe(30);
    expect(jobSnab(buildSmeta('lift')!, {}, today).rows).toHaveLength(0);
  });
});

describe('reserve', () => {
  it('adds the reserve and rounds up to the sales step', () => {
    expect(snabRow('concrete', 33.12)).toMatchObject({ reserve: 5, qty: 35 }); // 34.78 → 35
    expect(snabRow('sand', 7.36).qty).toBe(9); // +10% = 8.1 → 9
    expect(snabRow('rebar', 2.65).qty).toBe(2.9); // +7% = 2.84 → 2.9
  });
});

describe('СпецПласт16 material prices', () => {
  it('uses the markup tiers with their boundaries', () => {
    expect(markupRate(0)).toBe(MARKUP_SMALL);
    expect(markupRate(299_999)).toBe(0.3);
    expect(markupRate(300_000)).toBe(MARKUP_MEDIUM);
    expect(markupRate(1_000_000)).toBe(0.27);
    expect(markupRate(1_000_001)).toBe(MARKUP_LARGE);
    expect(MARKUP_LARGE).toBe(0.25);
  });

  it('rounds unit prices up to nice numbers', () => {
    expect(nicePrice(640)).toBe(640);
    expect(nicePrice(641)).toBe(650);
    expect(nicePrice(991)).toBe(1000);
    expect(nicePrice(1001)).toBe(1050);
    expect(nicePrice(9999)).toBe(10_000);
    expect(nicePrice(10_001)).toBe(10_100);
  });

  it('marks up the midpoint of the reference range', () => {
    // Mid 6 500 × 1.30 = 8 450.
    expect(materialPrice(ref(6000, 7000, '2026-10-01'), 100_000)).toBe(8450);
    // Mid 70 000 × 1.25 = 87 500 for a big order.
    expect(materialPrice(ref(65_000, 75_000, '2026-10-01'), 1_400_000)).toBe(87_500);
  });

  it('prices fresh rows only and picks the tier from their reference subtotal', () => {
    const rows = priceRows([snabRow('concrete', 10), snabRow('sand', 10)], today, prices);
    expect(rows[0]).toMatchObject({ qty: 10.5, price: 8450, cost: Math.round(10.5 * 8450) });
    expect(rows[1]).toMatchObject({ price: null, cost: null });
    const big = priceRows([snabRow('concrete', 60)], today, prices); // 63 m³ × 6 500 = 409 500
    expect(big[0]!.price).toBe(nicePrice(6500 * 1.27));
  });

  it('hides a price once it is older than 14 days', () => {
    expect(MAX_PRICE_AGE_DAYS).toBe(14);
    expect(ageDays('2026-09-18', today)).toBe(14);
    expect(freshPrice('concrete', new Date(2026, 9, 12), prices)).not.toBeNull(); // day 14
    expect(freshPrice('concrete', new Date(2026, 9, 13), prices)).toBeNull(); // day 15
    expect(freshPrice('sand', today, prices)).toBeNull();
    expect(freshPrice('concrete', new Date(2026, 8, 1), prices)).toBeNull(); // checked in the future
    expect(freshPrice('rebar', today, prices)).toBeNull();
  });
});

describe('delivery, machinery and the order', () => {
  it('puts the СпецПласт16 delivery right after the bulk materials', () => {
    const list = projectSnab(buildProject({ object: 'house', foundation: 'slab' }), today, {});
    const truck = list.delivery.find((d) => d.row.machine === 'truck')!;
    expect(truck.after).toBe('stone');
    expect(truck.title).toContain('СпецПласт16');
    expect(truck.row.rate).toBe(rateOf('truck'));
    const kmu = list.delivery.find((d) => d.row.machine === 'kmu')!;
    expect(kmu.after).toBe('blocks');
    expect(kmu.row.sum).toBe(kmu.row.hours * rateOf('kmu'));
    expect(list.deliveryTotal).toBe(truck.row.sum + kmu.row.sum);
    // Roller for the base and a crane for the blocks are offered too.
    expect(list.machinery.map((m) => m.row.machine)).toEqual(['roller', 'crane']);
    expect(list.hints[0]).toMatch(/Привезём за \d+ рейс/);
    // Nothing priced: the order still works with quantities.
    expect(list.unpriced).toBe(list.rows.length);
    expect(list.total).toBe(list.deliveryTotal);
  });

  it('writes an order with totals and no supplier names', () => {
    const list = projectSnab(buildProject({ object: 'house' }), today, prices);
    const text = snabText(list);
    expect(text).toContain('Материалы + доставка + разгрузка ≈');
    expect(text).toContain(UNPRICED);
    expect(text).toMatch(/× 8\s450\s₽/); // concrete, СпецПласт16 price
    expect(text).not.toMatch(/завод|Тест|https?:|источник|наценк/i);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(visibleSnabRows(list)).toBe(3);
  });

  it('declines the trip count', () => {
    expect([1, 3, 5, 11, 21, 22].map(trips)).toEqual([
      '1 рейс',
      '3 рейса',
      '5 рейсов',
      '11 рейсов',
      '21 рейс',
      '22 рейса',
    ]);
  });
});

describe('CSV for Excel', () => {
  it('quotes separators and quotes, writes decimal commas', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('блок «D500» "300"')).toBe('"блок «D500» ""300"""');
    expect(csvField(2.5)).toBe('2,5');
    expect(csvField('plain')).toBe('plain');
  });

  it('starts with a BOM, uses «;» and CRLF, has no links or sources', () => {
    const csv = snabCsv(projectSnab(buildProject({ object: 'house' }), today, prices));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]!.split(';')[0]).toBe('Позиция');
    expect(lines[2]).toMatch(/^Бетон М300;м³;[\d,]+;5;[\d,]+;8450;\d+$/);
    expect(csv).not.toMatch(/https?:|завод/);
    expect(csv).toContain('СпецПласт16');
  });
});
