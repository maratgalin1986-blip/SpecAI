import { describe, expect, it } from 'vitest';
import {
  conversionToProvider,
  formatDuration,
  funnelStageOf,
  funnelStages,
  medianTimeToFirstBid,
  ordersInPeriod,
  parseFunnelPeriod,
  stuckOrders,
  type FunnelOrder,
} from './adminFunnel';

const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function order(partial: Partial<FunnelOrder> & { id: string }): FunnelOrder {
  return { status: 'OPEN', createdAt: hoursAgo(1), bids: [], ...partial };
}

describe('funnelStageOf', () => {
  it('follows the order and booking statuses', () => {
    expect(funnelStageOf(order({ id: 'a' }))).toBe('created');
    expect(
      funnelStageOf(order({ id: 'b', bids: [{ createdAt: hoursAgo(0.5), status: 'PENDING' }] })),
    ).toBe('offers');
    expect(funnelStageOf(order({ id: 'c', status: 'MATCHED', bookingStatus: 'PENDING' }))).toBe(
      'chosen',
    );
    expect(funnelStageOf(order({ id: 'd', status: 'MATCHED', bookingStatus: 'CONFIRMED' }))).toBe(
      'chosen',
    );
    expect(funnelStageOf(order({ id: 'e', status: 'MATCHED', bookingStatus: 'ACTIVE' }))).toBe(
      'onsite',
    );
    expect(funnelStageOf(order({ id: 'f', status: 'MATCHED', bookingStatus: 'COMPLETED' }))).toBe(
      'done',
    );
    expect(
      funnelStageOf(
        order({
          id: 'g',
          status: 'CANCELLED',
          bids: [{ createdAt: hoursAgo(1), status: 'PENDING' }],
        }),
      ),
    ).toBe('cancelled');
  });
});

describe('funnelStages', () => {
  it('counts every stage in the timeline order with shares', () => {
    const stages = funnelStages([
      order({ id: '1' }),
      order({ id: '2' }),
      order({ id: '3', bids: [{ createdAt: hoursAgo(0.5), status: 'PENDING' }] }),
      order({ id: '4', status: 'MATCHED', bookingStatus: 'COMPLETED' }),
    ]);
    expect(stages.map((stage) => stage.title)).toEqual([
      'Создан',
      'Предложения',
      'Исполнитель выбран',
      'На объекте',
      'Завершён',
      'Отменён',
    ]);
    expect(stages.map((stage) => stage.count)).toEqual([2, 1, 0, 0, 1, 0]);
    expect(stages[0]!.share).toBeCloseTo(0.5);
    expect(conversionToProvider(stages)).toBeCloseTo(0.25);
  });

  it('is empty-safe', () => {
    const stages = funnelStages([]);
    expect(stages.every((stage) => stage.count === 0 && stage.share === 0)).toBe(true);
    expect(conversionToProvider(stages)).toBe(0);
  });
});

describe('ordersInPeriod', () => {
  it('keeps orders of the last N days and drops chat imports under review', () => {
    const inside = order({ id: 'in', createdAt: hoursAgo(6 * 24) });
    const outside = order({ id: 'out', createdAt: hoursAgo(8 * 24) });
    const review = order({ id: 'rev', status: 'PENDING_REVIEW' });
    expect(ordersInPeriod([inside, outside, review], 7, NOW)).toEqual([inside]);
    expect(ordersInPeriod([inside, outside, review], 30, NOW)).toEqual([inside, outside]);
  });

  it('parses the period from the query string', () => {
    expect(parseFunnelPeriod('7')).toBe(7);
    expect(parseFunnelPeriod(['90'])).toBe(90);
    expect(parseFunnelPeriod('15')).toBe(30);
    expect(parseFunnelPeriod(undefined)).toBe(30);
  });
});

describe('stuckOrders', () => {
  it('flags open orders without bids after 24 h and unanswered bids after 48 h', () => {
    const fresh = order({ id: 'fresh', createdAt: hoursAgo(5) });
    const silent = order({ id: 'silent', createdAt: hoursAgo(30) });
    const waiting = order({
      id: 'waiting',
      createdAt: hoursAgo(80),
      bids: [
        { createdAt: hoursAgo(60), status: 'PENDING' },
        { createdAt: hoursAgo(10), status: 'PENDING' },
      ],
    });
    const recentBid = order({
      id: 'recent',
      createdAt: hoursAgo(80),
      bids: [{ createdAt: hoursAgo(10), status: 'PENDING' }],
    });
    const rejectedOnly = order({
      id: 'rejected',
      createdAt: hoursAgo(80),
      bids: [{ createdAt: hoursAgo(70), status: 'REJECTED' }],
    });
    const matched = order({ id: 'matched', status: 'MATCHED', createdAt: hoursAgo(100) });

    const stuck = stuckOrders([fresh, silent, waiting, recentBid, rejectedOnly, matched], NOW);
    expect(stuck.map((item) => [item.order.id, item.reason])).toEqual([
      ['waiting', 'no_choice'],
      ['silent', 'no_bids'],
    ]);
    expect(stuck[0]!.hours).toBeCloseTo(60);
    expect(stuck[1]!.hours).toBeCloseTo(30);
  });
});

describe('medianTimeToFirstBid', () => {
  it('takes the earliest bid of each order and the middle value', () => {
    const orders = [
      order({ id: 'a', createdAt: hoursAgo(10), bids: [{ createdAt: hoursAgo(9), status: 'X' }] }),
      order({
        id: 'b',
        createdAt: hoursAgo(10),
        bids: [
          { createdAt: hoursAgo(2), status: 'X' },
          { createdAt: hoursAgo(7), status: 'X' },
        ],
      }),
      order({ id: 'c', createdAt: hoursAgo(10), bids: [{ createdAt: hoursAgo(0), status: 'X' }] }),
      order({ id: 'none', createdAt: hoursAgo(10) }),
    ];
    // Waits: 1 h, 3 h, 10 h → median 3 h.
    expect(medianTimeToFirstBid(orders)).toBe(3 * 3_600_000);
    // Even count: the mean of the two middle values (1 h, 3 h → 2 h).
    expect(medianTimeToFirstBid(orders.slice(0, 2))).toBe(2 * 3_600_000);
    expect(medianTimeToFirstBid([orders[3]!])).toBeNull();
  });

  it('formats durations for the dashboard', () => {
    expect(formatDuration(5 * 60_000)).toBe('5 мин');
    expect(formatDuration(0)).toBe('1 мин');
    expect(formatDuration(3.5 * 3_600_000)).toBe('3,5 ч');
    expect(formatDuration(26 * 3_600_000)).toBe('1 д 2 ч');
    expect(formatDuration(48 * 3_600_000)).toBe('2 д');
  });
});
