import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * The gate of every /api/cron/* route: the request must carry
 * `Authorization: Bearer <CRON_SECRET>`. Vercel sends it itself for the
 * crons of apps/web/vercel.json once the variable is set; the GitHub Actions
 * workflows send the repository secret of the same name. Without the
 * variable nothing is allowed (audit 2026-11-08, №5: the old fallback let
 * anyone in with a `vercel-cron` user agent).
 */
export function cronAllowed(request: Pick<NextRequest, 'headers'>): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(auth);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
