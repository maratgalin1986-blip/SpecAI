// Once a day per cron job: a repeated call (a retry, a manual run, the daily
// cron calling the evening one) must not send the digest or the reminders
// again. The marker is a row with a unique key, "cron:<job>:<Moscow day>",
// in AdminFeedRead — an existing table with exactly that shape, so no schema
// change; the admin feed only reads its own "<kind>:<id>" keys and never
// sees these.
import { prisma } from '@specai/database';
import { moscowDateKey } from './bookingRules';

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
  try {
    await prisma.adminFeedRead.create({ data: { key } });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
  try {
    return await task();
  } catch (error) {
    await prisma.adminFeedRead.deleteMany({ where: { key } }).catch(() => undefined);
    throw error;
  }
}
