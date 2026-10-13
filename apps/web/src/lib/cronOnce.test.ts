import { beforeEach, describe, expect, it, vi } from 'vitest';

const keys = new Set<string>();
vi.mock('@specai/database', () => ({
  prisma: {
    adminFeedRead: {
      create: vi.fn(async ({ data }: { data: { key: string } }) => {
        if (keys.has(data.key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        keys.add(data.key);
        return data;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        keys.delete(where.key);
        return { count: 1 };
      }),
    },
  },
}));

const { cronRunKey, onceADay } = await import('./cronOnce');

beforeEach(() => keys.clear());

describe('onceADay', () => {
  // 19:00 Moscow on the 13th and an hour later; the 14th the next evening.
  const evening = new Date('2026-10-13T16:00:00Z');
  const later = new Date('2026-10-13T17:00:00Z');
  const nextDay = new Date('2026-10-14T16:00:00Z');

  it('keys the run by the Moscow day', () => {
    expect(cronRunKey('evening', evening)).toBe('cron:evening:2026-10-13');
    // 00:30 Moscow on the 14th is still 21:30 UTC on the 13th.
    expect(cronRunKey('evening', new Date('2026-10-13T21:30:00Z'))).toBe('cron:evening:2026-10-14');
  });

  it('runs the task once a day and skips repeated calls', async () => {
    const task = vi.fn(async () => 'sent');
    expect(await onceADay('evening', task, evening)).toBe('sent');
    expect(await onceADay('evening', task, later)).toBeNull();
    expect(await onceADay('weekly', task, later)).toBe('sent');
    expect(await onceADay('evening', task, nextDay)).toBe('sent');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('lets a retry run after the task failed', async () => {
    await expect(
      onceADay('evening', async () => Promise.reject(new Error('db down')), evening),
    ).rejects.toThrow('db down');
    expect(await onceADay('evening', async () => 'sent', later)).toBe('sent');
  });
});
