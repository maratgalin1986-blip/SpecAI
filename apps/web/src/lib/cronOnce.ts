// Once a day per cron job: a repeated call (a retry, a manual run, the daily
// cron calling the evening one) must not send the digest or the reminders
// again. The marker is a row with a unique key, "cron:<job>:<Moscow day>",
// in AdminFeedRead — an existing table with exactly that shape, so no schema
// change; the admin feed only reads its own "<kind>:<id>" keys and never
// sees these.
import { prisma } from '@specai/database';
import { moscowDateKey } from './bookingRules';

/** A claim older than this with no «done» mark counts as a killed run. */
export const STALE_CLAIM_MS = 30 * 60_000;

export function cronRunKey(job: string, now: Date = new Date()): string {
  return `cron:${job}:${moscowDateKey(now)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Runs `task` unless this job already ran today (Moscow); null when skipped.
 * The day is claimed before the task starts, so two calls at once cannot
 * both send; if the task throws, the claim is dropped so a retry can run it.
 */
export async function onceADay<T>(
  job: string,
  task: () => Promise<T>,
  now: Date = new Date(),
): Promise<T | null> {
  const key = cronRunKey(job, now);
  const doneKey = `${key}:done`;
  const claim = async () => {
    try {
      await prisma.adminFeedRead.create({ data: { key } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  };
  if (!(await claim())) {
    // A claim with no «done» mark after STALE_CLAIM_MS: the function was
    // killed mid-way (a serverless timeout), so the day is retried.
    const [done, existing] = await Promise.all([
      prisma.adminFeedRead.findUnique({ where: { key: doneKey } }),
      prisma.adminFeedRead.findUnique({ where: { key } }),
    ]);
    const stale = existing && now.getTime() - existing.readAt.getTime() > STALE_CLAIM_MS;
    if (done || !stale) return null;
    await prisma.adminFeedRead.deleteMany({ where: { key } });
    if (!(await claim())) return null;
  }
  try {
    const result = await task();
    await prisma.adminFeedRead.create({ data: { key: doneKey } }).catch(() => undefined);
    return result;
  } catch (error) {
    await prisma.adminFeedRead.deleteMany({ where: { key } }).catch(() => undefined);
    throw error;
  }
}
