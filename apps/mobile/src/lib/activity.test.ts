import { describe, expect, it } from 'vitest';
import { customerStripText, feedTodayText, QUIET_DAY } from './activity';

describe('activity strip', () => {
  it('says the real numbers, «рядом» only with the customer’s position', () => {
    expect(customerStripText({ orders: 14, online: 9, confirmed: 2 }, 3)).toBe(
      'Сегодня: 14 заявок · 3 машины на линии рядом',
    );
    expect(customerStripText({ orders: 14, online: 9, confirmed: 2 }, null)).toBe(
      'Сегодня: 14 заявок · 9 машин на линии',
    );
    expect(customerStripText({ orders: 1, online: 5, confirmed: 0 }, 0)).toBe('Сегодня: 1 заявка');
  });

  it('shows a neutral line at zero, never «0 заявок»', () => {
    expect(customerStripText({ orders: 0, online: 0, confirmed: 0 }, null)).toBe(QUIET_DAY);
    expect(feedTodayText({ orders: 0, online: 4, confirmed: 1 })).toBe(QUIET_DAY);
    expect(QUIET_DAY).not.toMatch(/\d/);
  });

  it('feeds the provider the count of new orders', () => {
    expect(feedTodayText({ orders: 14, online: 0, confirmed: 0 })).toBe('Сегодня 14 новых заявок');
    expect(feedTodayText({ orders: 1, online: 0, confirmed: 0 })).toBe('Сегодня 1 новая заявка');
    expect(feedTodayText({ orders: 3, online: 0, confirmed: 0 })).toBe('Сегодня 3 новые заявки');
  });
});
