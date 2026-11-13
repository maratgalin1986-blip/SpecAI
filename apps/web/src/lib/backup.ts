// The weekly database copy (docs/backup.md): what the owner is told and the
// order of the steps. The copy itself — reading, encryption, the restore
// check — lives in packages/database/src/backup; sending is lib/backupSend.ts.
import {
  BackupTimeoutError,
  BackupVerifyError,
  type BuiltBackup,
} from '@specai/database/src/backup';
import { SITE } from './site';

const MOSCOW = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const NUMBER = new Intl.NumberFormat('ru-RU');

function moscowParts(date: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of MOSCOW.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

/** «12.11.2026 03:10» by Moscow time. */
export function backupDateLabel(date: Date): string {
  const { day, month, year, hour, minute } = moscowParts(date);
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${NUMBER.format(Math.round(kb))} КБ`;
  return `${NUMBER.format(Math.round((kb / 1024) * 10) / 10)} МБ`;
}

/** `iistroyka24-2026-11-12-0310-1of2.bkp`: the parts of one copy share the date and time. */
export function backupFileName(date: Date, part: number, parts: number): string {
  const { day, month, year, hour, minute } = moscowParts(date);
  return `iistroyka24-${year}-${month}-${day}-${hour}${minute}-${part}of${parts}.bkp`;
}

export interface BackupNumbers {
  tables: number;
  rows: number;
  bytes: number;
  parts: number;
}

/** The text under the file in the owner's chat. Numbers only. */
export function backupCaption(numbers: BackupNumbers & { createdAt: Date }, part: number): string {
  const lines = [
    `Копия базы «${SITE.platform}» от ${backupDateLabel(numbers.createdAt)} МСК`,
    `Таблиц: ${NUMBER.format(numbers.tables)}, строк: ${NUMBER.format(numbers.rows)}, размер: ${formatBytes(numbers.bytes)}`,
    'Проверка восстановления пройдена ✅',
  ];
  if (numbers.parts > 1) {
    lines.push(`Часть ${part} из ${numbers.parts} — для восстановления нужны все части.`);
  }
  lines.push('Файл зашифрован. Удалять его из чата не нужно.');
  return lines.join('\n');
}

export function backupFailureText(now: Date): string {
  return (
    `⚠️ Копия базы «${SITE.platform}» от ${backupDateLabel(now)} МСК не создана. ` +
    'Сайт работает как обычно, данные на месте. Сообщите об этом разработчику сайта.'
  );
}

export type BackupFailure = 'no-chat' | 'timeout' | 'verify' | 'build' | 'send';

export type BackupOutcome =
  ({ ok: true } & BackupNumbers) | { ok: false; failed: BackupFailure; sent?: number };

export interface BackupDeps {
  /** Whether there is a chat to send the copy to. */
  hasChat(): boolean;
  /** Builds the encrypted, verified copy; must finish by `deadline`. */
  build(deadline: number): Promise<BuiltBackup>;
  sendFile(file: Buffer, name: string, caption: string): Promise<boolean>;
  notify(text: string): Promise<boolean>;
  now?: () => number;
}

/** No new step of reading the database starts after this much of the run. */
export const BACKUP_BUILD_BUDGET_MS = 35_000;

/**
 * Makes the copy and sends it to the owner; on any failure the owner gets
 * one short message with no details. Never throws; the answer is numbers
 * and a word.
 */
export async function runBackup(deps: BackupDeps): Promise<BackupOutcome> {
  const now = deps.now ?? Date.now;
  const started = now();
  const fail = async (failed: BackupFailure, sent?: number): Promise<BackupOutcome> => {
    if (failed !== 'no-chat') await deps.notify(backupFailureText(new Date(started)));
    return { ok: false, failed, ...(sent === undefined ? {} : { sent }) };
  };
  if (!deps.hasChat()) return fail('no-chat');

  let built: BuiltBackup;
  try {
    built = await deps.build(started + BACKUP_BUILD_BUDGET_MS);
  } catch (error) {
    if (error instanceof BackupVerifyError) {
      // Table names and row counts only.
      console.error('[backup] restore check failed', error.problems);
      return fail('verify');
    }
    if (error instanceof BackupTimeoutError) {
      console.error('[backup] out of time');
      return fail('timeout');
    }
    // A database error may quote a row: only its kind goes to the log.
    const code = (error as { code?: string } | null)?.code;
    console.error('[backup] failed', error instanceof Error ? error.name : 'error', code ?? '');
    return fail('build');
  }

  const numbers = {
    tables: built.tables,
    rows: built.rows,
    bytes: built.bytes,
    parts: built.parts.length,
  };
  for (let index = 0; index < built.parts.length; index += 1) {
    const delivered = await deps.sendFile(
      built.parts[index]!,
      backupFileName(built.createdAt, index + 1, built.parts.length),
      backupCaption({ ...numbers, createdAt: built.createdAt }, index + 1),
    );
    if (!delivered) {
      console.error(`[backup] part ${index + 1} of ${built.parts.length} was not delivered`);
      return fail('send', index);
    }
  }
  return { ok: true, ...numbers };
}
