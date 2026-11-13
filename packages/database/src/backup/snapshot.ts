// Reads the whole database for a copy, through Prisma's raw queries inside
// one REPEATABLE READ transaction: every table and every count is seen at the
// same moment, whatever the site writes meanwhile. Tables are taken from the
// database itself, so a new model needs no change here.
import type { SnapshotReader } from './dump';

/** The part of a Prisma client (or of a transaction) this module uses. */
export interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface TransactionalDb {
  $transaction<T>(
    fn: (tx: RawDb) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: 'RepeatableRead' },
  ): Promise<T>;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const MAX_BATCH_ROWS = 500;
const CURSOR = 'backup_rows';

/** Rows per fetch, so one batch stays near `batchBytes` even for tables with files. */
export function batchRows(tableBytes: number, rows: number, batchBytes: number): number {
  if (rows <= 0 || tableBytes <= 0) return MAX_BATCH_ROWS;
  const perRow = tableBytes / rows;
  return Math.max(1, Math.min(MAX_BATCH_ROWS, Math.floor(batchBytes / perRow)));
}

export function snapshotReader(db: RawDb, batchBytes = 8 * 1024 * 1024): SnapshotReader {
  const count = async (table: string) => {
    const [row] = await db.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM ${quoteIdent(table)}`,
    );
    return Number(row?.n ?? 0);
  };
  return {
    async tables() {
      const rows = await db.$queryRawUnsafe<{ name: string }[]>(
        `SELECT c.relname::text AS name FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema() AND c.relkind = 'r'
          ORDER BY c.relname`,
      );
      return rows.map((row) => row.name);
    },
    count,
    async *rows(table: string) {
      const [size] = await db.$queryRawUnsafe<{ bytes: string }[]>(
        `SELECT pg_total_relation_size(c.oid)::text AS bytes FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema() AND c.relname = $1`,
        table,
      );
      const take = batchRows(Number(size?.bytes ?? 0), await count(table), batchBytes);
      // A cursor reads the table once, in pieces, without sorting it.
      await db.$executeRawUnsafe(
        `DECLARE ${CURSOR} NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM ${quoteIdent(table)} t`,
      );
      try {
        for (;;) {
          const batch = await db.$queryRawUnsafe<{ row: string }[]>(`FETCH ${take} FROM ${CURSOR}`);
          if (batch.length === 0) break;
          yield batch.map((entry) => entry.row);
          if (batch.length < take) break;
        }
      } finally {
        // After a failed query the transaction is over and so is the cursor.
        await db.$executeRawUnsafe(`CLOSE ${CURSOR}`).catch(() => undefined);
      }
    },
  };
}

/** Runs `task` with a reader that sees one moment of the database. */
export function withSnapshot<T>(
  db: TransactionalDb,
  task: (reader: SnapshotReader) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return db.$transaction((tx) => task(snapshotReader(tx)), {
    isolationLevel: 'RepeatableRead',
    maxWait: 10_000,
    timeout: timeoutMs,
  });
}
