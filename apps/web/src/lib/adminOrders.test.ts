import { describe, expect, it } from 'vitest';
import { adminCanMoveOrder } from './adminOrders';

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
