// What is inside a database copy before compression and encryption: text
// lines. The first line names the format and the moment of the copy, then
// for every table a `#table "<name>"` line followed by its rows — one JSON
// object per line, exactly as PostgreSQL printed it (numbers and dates are
// never re-read by JavaScript, so nothing is rounded) — and a closing `#end`
// line with the totals, so a cut-off copy is noticed.
import { once } from 'node:events';
import { createGzip, gunzipSync } from 'node:zlib';
import { BACKUP_PART_BYTES, BackupError, decryptBackup, encryptBackup } from './format';

const HEAD = '#iistroyka24-backup ';
const TABLE = '#table ';
const END = '#end ';
const NEWLINE = 0x0a;
const HASH = 0x23;
const BRACE = 0x7b;

export interface TableCount {
  table: string;
  rows: number;
}

/** A consistent view of the database to copy (see snapshot.ts). */
export interface SnapshotReader {
  tables(): Promise<string[]>;
  count(table: string): Promise<number>;
  /** Batches of rows, each row a single-line JSON object. */
  rows(table: string): AsyncIterable<string[]>;
}

export interface WrittenDump {
  compressed: Buffer;
  /** Row counts as the database itself reports them (`count(*)`). */
  counts: TableCount[];
}

/** The copy did not fit the time the function has. */
export class BackupTimeoutError extends Error {
  constructor() {
    super('backup ran out of time');
    this.name = 'BackupTimeoutError';
  }
}

/** Reads every table and gives the gzip-compressed dump. */
export async function writeDump(
  reader: SnapshotReader,
  options: { createdAt: Date; deadline?: number },
): Promise<WrittenDump> {
  const gzip = createGzip({ level: 6 });
  const chunks: Buffer[] = [];
  gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = once(gzip, 'end');
  const write = async (text: string) => {
    if (!gzip.write(text)) await once(gzip, 'drain');
  };
  const checkTime = () => {
    if (options.deadline !== undefined && Date.now() > options.deadline) {
      throw new BackupTimeoutError();
    }
  };

  await write(
    `${HEAD}${JSON.stringify({ version: 1, createdAt: options.createdAt.toISOString() })}\n`,
  );
  const counts: TableCount[] = [];
  let total = 0;
  for (const table of await reader.tables()) {
    checkTime();
    counts.push({ table, rows: await reader.count(table) });
    await write(`${TABLE}${JSON.stringify(table)}\n`);
    for await (const batch of reader.rows(table)) {
      checkTime();
      if (batch.length === 0) continue;
      for (const row of batch) {
        if (!row.startsWith('{') || row.includes('\n')) throw new Error('unexpected row shape');
      }
      total += batch.length;
      await write(`${batch.join('\n')}\n`);
    }
  }
  await write(`${END}${JSON.stringify({ tables: counts.length, rows: total })}\n`);
  gzip.end();
  await finished;
  return { compressed: Buffer.concat(chunks), counts };
}

export interface DumpTable {
  name: string;
  rows: number;
  /** Column names, from the first row; empty for an empty table. */
  columns: string[];
  /** Where the rows sit in the uncompressed dump. */
  start: number;
  end: number;
}

export interface Dump {
  createdAt: string;
  tables: DumpTable[];
  plain: Buffer;
}

const BROKEN = 'Копия повреждена: содержимое не читается. Скачайте файл из чата ещё раз.';

function parseMarker<T>(line: Buffer, prefix: string): T {
  try {
    return JSON.parse(line.subarray(prefix.length).toString('utf8')) as T;
  } catch {
    throw new BackupError('damaged', BROKEN);
  }
}

/** Unpacks a decrypted copy and indexes its tables; rows are not parsed. */
export function readDump(compressed: Buffer): Dump {
  let plain: Buffer;
  try {
    plain = gunzipSync(compressed);
  } catch {
    throw new BackupError('damaged', BROKEN);
  }
  const tables: DumpTable[] = [];
  let createdAt: string | null = null;
  let current: DumpTable | null = null;
  let ended = false;
  let total = 0;
  let position = 0;
  while (position < plain.length) {
    let lineEnd = plain.indexOf(NEWLINE, position);
    if (lineEnd === -1) lineEnd = plain.length;
    const line = plain.subarray(position, lineEnd);
    const next = lineEnd + 1;
    if (ended) throw new BackupError('damaged', BROKEN);
    if (line[0] === BRACE && current) {
      if (current.rows === 0) {
        current.start = position;
        current.columns = Object.keys(parseMarker<Record<string, unknown>>(line, ''));
      }
      current.rows += 1;
      current.end = Math.min(next, plain.length);
      total += 1;
    } else if (line[0] === HASH) {
      const text = line.subarray(0, 24).toString('utf8');
      if (text.startsWith(HEAD) && createdAt === null && tables.length === 0) {
        const head = parseMarker<{ version?: number; createdAt?: string }>(line, HEAD);
        if (head.version !== 1 || typeof head.createdAt !== 'string') {
          throw new BackupError('damaged', BROKEN);
        }
        createdAt = head.createdAt;
      } else if (text.startsWith(TABLE) && createdAt !== null) {
        const name = parseMarker<unknown>(line, TABLE);
        if (typeof name !== 'string' || tables.some((table) => table.name === name)) {
          throw new BackupError('damaged', BROKEN);
        }
        current = { name, rows: 0, columns: [], start: next, end: next };
        tables.push(current);
      } else if (text.startsWith(END) && createdAt !== null) {
        const end = parseMarker<{ tables?: number; rows?: number }>(line, END);
        if (end.tables !== tables.length || end.rows !== total) {
          throw new BackupError('damaged', BROKEN);
        }
        ended = true;
      } else {
        throw new BackupError('damaged', BROKEN);
      }
    } else {
      throw new BackupError('damaged', BROKEN);
    }
    position = next;
  }
  if (createdAt === null || !ended) throw new BackupError('damaged', BROKEN);
  return { createdAt, tables, plain };
}

export function dumpCounts(dump: Dump): TableCount[] {
  return dump.tables.map(({ name, rows }) => ({ table: name, rows }));
}

/**
 * The rows of one table as JSON array texts (`[{…},{…}]`), each of at most
 * `maxRows` rows and about `maxBytes` bytes.
 */
export function* dumpBatches(
  dump: Dump,
  table: DumpTable,
  maxRows = 500,
  maxBytes = 4 * 1024 * 1024,
): Generator<{ json: string; rows: number }> {
  let position = table.start;
  let lines: string[] = [];
  let bytes = 0;
  while (position < table.end) {
    let lineEnd = dump.plain.indexOf(NEWLINE, position);
    if (lineEnd === -1 || lineEnd > table.end) lineEnd = table.end;
    lines.push(dump.plain.subarray(position, lineEnd).toString('utf8'));
    bytes += lineEnd - position;
    position = lineEnd + 1;
    if (lines.length >= maxRows || bytes >= maxBytes) {
      yield { json: `[${lines.join(',')}]`, rows: lines.length };
      lines = [];
      bytes = 0;
    }
  }
  if (lines.length > 0) yield { json: `[${lines.join(',')}]`, rows: lines.length };
}

/**
 * Compares the row counts the database reported with those read back from
 * the copy. Gives the differences as text (table names and numbers only);
 * an empty list means the copy holds every row.
 */
export function compareCounts(expected: TableCount[], actual: TableCount[]): string[] {
  const problems: string[] = [];
  const read = new Map(actual.map((entry) => [entry.table, entry.rows]));
  for (const { table, rows } of expected) {
    const got = read.get(table);
    if (got === undefined) problems.push(`${table}: таблицы нет в копии`);
    else if (got !== rows) problems.push(`${table}: в базе ${rows}, в копии ${got}`);
    read.delete(table);
  }
  for (const table of read.keys()) problems.push(`${table}: лишняя таблица в копии`);
  return problems;
}

/** The copy was written but reading it back gave other numbers. */
export class BackupVerifyError extends Error {
  constructor(readonly problems: string[]) {
    super(`backup verification failed: ${problems.length} table(s) differ`);
    this.name = 'BackupVerifyError';
  }
}

export interface BuiltBackup {
  /** Encrypted files, ready to send. */
  parts: Buffer[];
  createdAt: Date;
  counts: TableCount[];
  tables: number;
  rows: number;
  /** Size of all parts together. */
  bytes: number;
}

/**
 * Copies the database into encrypted parts and proves the copy can be
 * restored: the parts are decrypted and unpacked again and the rows of
 * every table are counted against the database's own numbers.
 */
export async function buildBackup(
  reader: SnapshotReader,
  secret: string,
  options: { createdAt?: Date; deadline?: number; partBytes?: number } = {},
): Promise<BuiltBackup> {
  const createdAt = options.createdAt ?? new Date();
  const { compressed, counts } = await writeDump(reader, {
    createdAt,
    deadline: options.deadline,
  });
  const parts = encryptBackup(compressed, secret, options.partBytes ?? BACKUP_PART_BYTES);
  const restored = readDump(decryptBackup(parts, secret));
  const problems = compareCounts(counts, dumpCounts(restored));
  if (problems.length > 0) throw new BackupVerifyError(problems);
  return {
    parts,
    createdAt,
    counts,
    tables: counts.length,
    rows: counts.reduce((sum, entry) => sum + entry.rows, 0),
    bytes: parts.reduce((sum, part) => sum + part.length, 0),
  };
}
