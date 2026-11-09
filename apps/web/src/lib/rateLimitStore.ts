import { prisma } from '@specai/database';
import type { RateLimitStore } from './durableRateLimit';

/**
 * The database counters for lib/durableRateLimit.ts (table RateLimitWindow).
 * Resolved at call time, so a test that mocks `@specai/database` without
 * this delegate gets null and the in-memory limit alone.
 */
export function rateLimitStore(): RateLimitStore | null {
  return (prisma as unknown as { rateLimitWindow?: RateLimitStore }).rateLimitWindow ?? null;
}
