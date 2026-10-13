import { describe, expect, it } from 'vitest';
import { adminCanMoveOrder, staleOrdersWhere } from './adminOrders';

describe('staleOrdersWhere', () => {
  it('takes only open orders that ended before today', () => {
    const today = new Date('2026-10-12T21:00:00Z');
    expect(staleOrdersWhere(today)).toEqual({ status: 'OPEN', desiredEndDate: { lt: today } });
  });
});

describe('adminCanMoveOrder', () => {
  it('publishes only orders waiting in moderation', () => {
    expect(adminCanMoveOrder('PENDING_REVIEW', 'OPEN')).toBe(true);
    // An erased chat order is CANCELLED; a booked one is MATCHED.
    expect(adminCanMoveOrder('CANCELLED', 'OPEN')).toBe(false);
    expect(adminCanMoveOrder('MATCHED', 'OPEN')).toBe(false);
    expect(adminCanMoveOrder('OPEN', 'OPEN')).toBe(false);
  });

  it('closes moderation and open orders, never a booked one', () => {
    expect(adminCanMoveOrder('PENDING_REVIEW', 'CANCELLED')).toBe(true);
    expect(adminCanMoveOrder('OPEN', 'CANCELLED')).toBe(true);
    expect(adminCanMoveOrder('MATCHED', 'CANCELLED')).toBe(false);
    expect(adminCanMoveOrder('CANCELLED', 'CANCELLED')).toBe(false);
  });
});
