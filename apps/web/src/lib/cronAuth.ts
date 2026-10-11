import type { NextRequest } from 'next/server';

/**
 * The gate of the Vercel crons (apps/web/vercel.json): with CRON_SECRET set
 * only requests carrying it are accepted, otherwise Vercel's own user agent.
 */
export function cronAllowed(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const fromCron = request.headers.get('user-agent')?.startsWith('vercel-cron');
  return secret ? auth === `Bearer ${secret}` : Boolean(fromCron);
}
