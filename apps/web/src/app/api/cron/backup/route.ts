import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { buildBackup, withSnapshot } from '@specai/database/src/backup';
import { clientIp } from '@/lib/loginErrors';
import { cronAllowed } from '@/lib/cronAuth';
import { onceADay } from '@/lib/cronOnce';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyTelegram } from '@/lib/notify';
import { backupFailureText, runBackup, type BackupOutcome } from '@/lib/backup';
import { ownerPrivateChatId, sendOwnerDocument } from '@/lib/backupSend';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends in its Data Cache.
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/** The database is read within this long (the build itself stops earlier). */
const SNAPSHOT_TIMEOUT_MS = 40_000;
/** No file is still being sent after this much of the run. */
const SEND_LATEST_MS = 55_000;

class BackupFailed extends Error {
  constructor(readonly outcome: BackupOutcome) {
    super('backup failed');
  }
}

// The weekly copy of the database outside its provider (docs/backup.md):
// every table is read at one moment, compressed, encrypted with a key made
// from CRON_SECRET, decrypted again to count the rows against the database,
// and sent as a file to the owner's own Telegram chat. Called once a week by
// .github/workflows/backup.yml with the CRON_SECRET repository secret
// (lib/cronAuth.ts). Production only; once a day (a repeated call sends no
// second file); the answer and the logs hold numbers only.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production only' }, { status: 403 });
  }
  if (!cronAllowed(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const rate = checkRateLimit(`backup:${clientIp(request)}`, { limit: 3, windowMs: 60_000 });
  if (!rate.ok) return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });

  const started = Date.now();
  const secret = process.env.CRON_SECRET ?? '';
  try {
    const outcome = await onceADay('backup', async () => {
      const result = await runBackup({
        hasChat: () => ownerPrivateChatId() !== null,
        build: (deadline) =>
          withSnapshot(
            prisma,
            (reader) => buildBackup(reader, secret, { deadline }),
            SNAPSHOT_TIMEOUT_MS,
          ),
        sendFile: (file, name, caption) =>
          sendOwnerDocument(file, name, caption, started + SEND_LATEST_MS - Date.now()),
        notify: notifyTelegram,
      });
      // A failed run frees the day, so the next call tries again.
      if (!result.ok) throw new BackupFailed(result);
      return result;
    });
    if (!outcome) return NextResponse.json({ ok: true, skipped: 'already sent today' });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof BackupFailed) {
      return NextResponse.json(error.outcome, { status: 500 });
    }
    // The day could not be claimed or released (lib/cronOnce.ts): the owner
    // hears about this failure too.
    console.error('[cron/backup] failed', error instanceof Error ? error.name : 'error');
    await notifyTelegram(backupFailureText(new Date(started)));
    return NextResponse.json({ ok: false, failed: 'build' }, { status: 500 });
  }
}
