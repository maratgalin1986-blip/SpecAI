import { describe, expect, it } from 'vitest';
import { cardTrust, trustLine } from './catalogTrust';

const company = { createdAt: new Date(Date.UTC(2026, 9, 5)), verified: true };

describe('cardTrust', () => {
  it('rounds the average and keeps the verified mark', () => {
    const trust = cardTrust(company, {
      companyId: 'c1',
      _avg: { rating: 4.8333 },
      _count: { _all: 12 },
    });
    expect(trust).toEqual({
      rating: 4.8,
      reviews: 12,
      since: 'с октября 2026',
      verified: true,
      provisional: false,
    });
    expect(trustLine(trust)).toBe('★ 4,8 · 12 отзывов · на площадке с октября 2026');
  });
  it('shows only the date without reviews', () => {
    const trust = cardTrust({ ...company, verified: false }, undefined);
    expect(trust.rating).toBeNull();
    expect(trustLine(trust)).toBe('на площадке с октября 2026');
  });
  it('agrees the noun with the count', () => {
    const one = cardTrust(company, { companyId: 'c1', _avg: { rating: 5 }, _count: { _all: 1 } });
    expect(trustLine(one)).toBe('★ 5 · 1 отзыв · на площадке с октября 2026');
  });
});
