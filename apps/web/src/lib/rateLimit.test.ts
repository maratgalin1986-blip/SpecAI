import { describe, expect, it } from 'vitest';
import { checkRateLimit, isRateLimited, recordAttempt, resetRateLimit } from './rateLimit';

const options = { limit: 3, windowMs: 60_000 };

describe('rateLimit', () => {
  it('checkRateLimit counts every call', () => {
    const key = `test:check:${Math.random()}`;
    expect(checkRateLimit(key, options).ok).toBe(true);
    expect(checkRateLimit(key, options).ok).toBe(true);
    expect(checkRateLimit(key, options).ok).toBe(true);
    const fourth = checkRateLimit(key, options);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it('isRateLimited only looks, recordAttempt counts, resetRateLimit forgets', () => {
    const key = `test:peek:${Math.random()}`;
    for (let i = 0; i < 10; i += 1) expect(isRateLimited(key, options).ok).toBe(true);
    recordAttempt(key, options);
    recordAttempt(key, options);
    recordAttempt(key, options);
    expect(isRateLimited(key, options).ok).toBe(false);
    resetRateLimit(key);
    expect(isRateLimited(key, options).ok).toBe(true);
  });

  it('forgets attempts outside the window', () => {
    const key = `test:window:${Math.random()}`;
    const start = 1_000_000;
    recordAttempt(key, options, start);
    recordAttempt(key, options, start + 1);
    recordAttempt(key, options, start + 2);
    expect(isRateLimited(key, options, start + 3).ok).toBe(false);
    expect(isRateLimited(key, options, start + options.windowMs + 10).ok).toBe(true);
  });
});
