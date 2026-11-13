// Checks a database copy and, when asked, writes it into an empty database.
// Instructions for people: docs/backup.md.
//
//   CRON_SECRET=… pnpm --filter @specai/database restore-backup <файлы копии>
//   CRON_SECRET=… RESTORE_DATABASE_URL=postgresql://… \
//     pnpm --filter @specai/database restore-backup <файлы копии> --write
//
// Without --write nothing is connected to and nothing is changed: the copy is
// decrypted, unpacked and its rows are counted. With --write the rows go
// into the database at RESTORE_DATABASE_URL — a name of its own, so the
// site's DATABASE_URL is never written to by accident — and only when that
// database holds no rows at all.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { PrismaClient } from '../generated/client';
import {
  BackupError,
  RestoreRefusedError,
  compareCounts,
  decryptBackup,
  dumpCounts,
  readDump,
  restoreDump,
  type TableCount,
} from '../src/backup';
import { resolveDatabaseUrl } from '../src/connection';

const WRITE_TIMEOUT_MS = 60 * 60_000;

/** Shown as it is: it holds table names and numbers only. */
class CountsDifferError extends Error {}

function printCounts(counts: TableCount[]) {
  const width = Math.max(...counts.map((entry) => entry.table.length), 7);
  for (const { table, rows } of counts) console.info(`  ${table.padEnd(width)}  ${rows}`);
  const total = counts.reduce((sum, entry) => sum + entry.rows, 0);
  console.info(`  ${'Всего'.padEnd(width)}  ${total} (таблиц: ${counts.length})`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const write = args.includes('--write');
  const files = args.filter((arg) => !arg.startsWith('--'));
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--write');
  if (files.length === 0 || unknown.length > 0) {
    console.error(
      'Укажите файлы копии (все части одной копии). Пример:\n' +
        '  CRON_SECRET=… pnpm --filter @specai/database restore-backup /путь/к/файлу.bkp\n' +
        'Чтобы записать копию в пустую базу, добавьте --write и адрес базы в RESTORE_DATABASE_URL.',
    );
    return 2;
  }
  // pnpm runs the script from packages/database; paths are given from where
  // the command was typed.
  const base = process.env.INIT_CWD ?? process.cwd();
  const parts = files.map((file) => readFileSync(isAbsolute(file) ? file : resolve(base, file)));
  const dump = readDump(decryptBackup(parts, process.env.CRON_SECRET ?? ''));
  const counts = dumpCounts(dump);
  console.info(`Копия от ${dump.createdAt} расшифрована и прочитана. Строк по таблицам:`);
  printCounts(counts);

  if (!write) {
    console.info('Это была только проверка: в базу ничего не записано.');
    return 0;
  }
  const url = process.env.RESTORE_DATABASE_URL;
  if (!url) {
    console.error(
      'Для записи укажите адрес пустой базы в переменной RESTORE_DATABASE_URL. Ничего не изменено.',
    );
    return 2;
  }
  const db = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl(url) ?? url } } });
  try {
    // One transaction: an error at any point leaves the database empty.
    const written = await db.$transaction(
      async (tx) => {
        const result = await restoreDump(tx, dump);
        const problems = compareCounts(
          counts.filter((entry) => entry.rows > 0),
          result,
        );
        if (problems.length > 0) {
          throw new CountsDifferError(
            `числа строк после записи не сошлись:\n  ${problems.join('\n  ')}\n`,
          );
        }
        return result;
      },
      { maxWait: 20_000, timeout: WRITE_TIMEOUT_MS },
    );
    console.info('Копия записана в базу. Строк в базе по таблицам:');
    printCounts(written);
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof BackupError || error instanceof RestoreRefusedError) {
      console.error(error.message);
    } else if (error instanceof CountsDifferError) {
      console.error(`Не получилось: ${error.message}В базу ничего не записано.`);
    } else {
      // A database error may quote a row, so only its kind is printed.
      const code = (error as { code?: string } | null)?.code;
      const name = error instanceof Error ? error.name : 'Error';
      console.error(
        `Не получилось: ${name}${code ? ` (${code})` : ''}. В базу ничего не записано. ` +
          'Подробности — с переменной RESTORE_DEBUG=1 (в них могут быть данные из копии).',
      );
      if (process.env.RESTORE_DEBUG === '1') console.error(error);
    }
    process.exit(1);
  });
