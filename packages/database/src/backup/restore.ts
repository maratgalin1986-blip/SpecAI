// Writing a copy back into a database (scripts/restore-backup.ts). Only an
// empty database is accepted: restoring never overwrites or mixes data.
//
// Tables are filled in the order their foreign keys allow. Where tables
// refer to each other in a circle (or a table to itself), the optional link
// is left empty at first and filled in by a second pass.
import { dumpBatches, type Dump, type TableCount } from './dump';
import { quoteIdent, type RawDb } from './snapshot';

export interface TargetColumn {
  name: string;
  nullable: boolean;
  hasDefault: boolean;
}

export interface TargetTable {
  name: string;
  columns: TargetColumn[];
  primaryKey: string[];
  rows: number;
}

export interface ForeignKey {
  table: string;
  columns: string[];
  references: string;
}

export interface TargetCatalog {
  tables: TargetTable[];
  foreignKeys: ForeignKey[];
}

export interface BackupTable {
  name: string;
  columns: string[];
  rows: number;
}

export interface RestoreStep {
  table: string;
  /** Columns written by the first pass. */
  columns: string[];
  /** Columns filled in by the second pass. */
  deferred: string[];
  primaryKey: string[];
}

/** Restoring was refused; `reasons` are ready to show (names and numbers only). */
export class RestoreRefusedError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join('\n'));
    this.name = 'RestoreRefusedError';
  }
}

/**
 * Decides whether the copy may be written into the target database and in
 * which order. Refuses when the target holds any row, or when its tables do
 * not match the copy.
 */
export function planRestore(backup: BackupTable[], catalog: TargetCatalog): RestoreStep[] {
  const busy = catalog.tables.filter((table) => table.rows > 0);
  if (busy.length > 0) {
    throw new RestoreRefusedError([
      'В базе уже есть данные, а восстановление пишет только в пустую базу. Ничего не изменено.',
      ...busy.map((table) => `  ${table.name}: строк — ${table.rows}`),
      'Создайте новую пустую базу и укажите её адрес.',
    ]);
  }

  const target = new Map(catalog.tables.map((table) => [table.name, table]));
  const filled = backup.filter((table) => table.rows > 0);
  const reasons: string[] = [];
  for (const table of filled) {
    const match = target.get(table.name);
    if (!match) {
      reasons.push(`В базе нет таблицы ${table.name}, а в копии она есть.`);
      continue;
    }
    const known = new Set(match.columns.map((column) => column.name));
    const unknown = table.columns.filter((column) => !known.has(column));
    if (unknown.length > 0) {
      reasons.push(`В таблице ${table.name} базы нет колонок из копии: ${unknown.join(', ')}.`);
    }
    const saved = new Set(table.columns);
    const required = match.columns.filter(
      (column) => !saved.has(column.name) && !column.nullable && !column.hasDefault,
    );
    if (required.length > 0) {
      reasons.push(
        `В таблице ${table.name} базы есть обязательные колонки, которых нет в копии: ${required
          .map((column) => column.name)
          .join(', ')}.`,
      );
    }
  }
  if (reasons.length > 0) {
    throw new RestoreRefusedError([
      'Таблицы базы не совпадают с копией. Ничего не изменено.',
      ...reasons.map((reason) => `  ${reason}`),
      'Сначала создайте в пустой базе таблицы той же версии сайта (см. docs/backup.md).',
    ]);
  }

  const names = new Set(filled.map((table) => table.name));
  const links = catalog.foreignKeys.filter(
    (key) => names.has(key.table) && names.has(key.references),
  );
  const nullableOf = (key: ForeignKey) => {
    const columns = new Map(target.get(key.table)!.columns.map((column) => [column.name, column]));
    return key.columns.filter((column) => columns.get(column)?.nullable);
  };

  const deferred = new Map<string, Set<string>>();
  const defer = (key: ForeignKey) => {
    const set = deferred.get(key.table) ?? new Set<string>();
    for (const column of nullableOf(key)) set.add(column);
    deferred.set(key.table, set);
  };
  // A table that refers to itself: the link waits for the second pass.
  let waiting = links.filter((key) => {
    if (key.table !== key.references) return true;
    if (nullableOf(key).length > 0) defer(key);
    return false;
  });

  const order: string[] = [];
  const placed = new Set<string>();
  const remaining = new Set([...names].sort());
  while (remaining.size > 0) {
    const ready = [...remaining].filter(
      (name) => !waiting.some((key) => key.table === name && !placed.has(key.references)),
    );
    if (ready.length > 0) {
      for (const name of ready) {
        order.push(name);
        placed.add(name);
        remaining.delete(name);
      }
      continue;
    }
    // A circle: put one optional link aside and go on.
    const loose = waiting.find(
      (key) =>
        remaining.has(key.table) && !placed.has(key.references) && nullableOf(key).length > 0,
    );
    if (!loose) {
      throw new RestoreRefusedError([
        'Таблицы ссылаются друг на друга по кругу обязательными связями — порядок записи не найден. Ничего не изменено.',
        `  ${[...remaining].join(', ')}`,
      ]);
    }
    defer(loose);
    waiting = waiting.filter((key) => key !== loose);
  }

  return order.map((name) => {
    const table = filled.find((entry) => entry.name === name)!;
    const later = deferred.get(name) ?? new Set<string>();
    const primaryKey = target.get(name)!.primaryKey;
    if (later.size > 0 && primaryKey.length === 0) {
      throw new RestoreRefusedError([
        `У таблицы ${name} нет первичного ключа — её связи нельзя дописать вторым проходом. Ничего не изменено.`,
      ]);
    }
    return {
      table: name,
      columns: table.columns.filter((column) => !later.has(column)),
      deferred: table.columns.filter((column) => later.has(column)),
      primaryKey,
    };
  });
}

export function insertSql(step: RestoreStep): string {
  const table = quoteIdent(step.table);
  const columns = step.columns.map(quoteIdent).join(', ');
  return `INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`;
}

export function linkSql(step: RestoreStep): string {
  const table = quoteIdent(step.table);
  const set = step.deferred.map((column) => `${quoteIdent(column)} = r.${quoteIdent(column)}`);
  const match = step.primaryKey.map(
    (column) => `t.${quoteIdent(column)} = r.${quoteIdent(column)}`,
  );
  const any = step.deferred.map((column) => `r.${quoteIdent(column)} IS NOT NULL`);
  return `UPDATE ${table} AS t SET ${set.join(', ')} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb) AS r WHERE ${match.join(' AND ')} AND (${any.join(' OR ')})`;
}

/** What the target database looks like: tables, columns, keys, row counts. */
export async function readTargetCatalog(db: RawDb): Promise<TargetCatalog> {
  const columns = await db.$queryRawUnsafe<
    { table: string; name: string; nullable: boolean; has_default: boolean }[]
  >(
    `SELECT c.relname::text AS "table", a.attname::text AS name,
            NOT a.attnotnull AS nullable, (a.atthasdef OR a.attidentity <> '') AS has_default
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
      ORDER BY c.relname, a.attnum`,
  );
  const keys = await db.$queryRawUnsafe<{ table: string; name: string }[]>(
    `SELECT c.relname::text AS "table", a.attname::text AS name
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
      WHERE i.indisprimary AND n.nspname = current_schema()
      ORDER BY c.relname, a.attnum`,
  );
  const foreignKeys = await db.$queryRawUnsafe<ForeignKey[]>(
    `SELECT c.relname::text AS "table", r.relname::text AS "references",
            ARRAY(SELECT a.attname::text
                    FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                   ORDER BY k.ord) AS columns
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_class r ON r.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f' AND n.nspname = current_schema()
      ORDER BY c.relname, con.conname`,
  );
  const names = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
      ORDER BY c.relname`,
  );
  const tables: TargetTable[] = [];
  for (const { name } of names) {
    tables.push({
      name,
      columns: columns
        .filter((column) => column.table === name)
        .map((column) => ({
          name: column.name,
          nullable: column.nullable,
          hasDefault: column.has_default,
        })),
      primaryKey: keys.filter((key) => key.table === name).map((key) => key.name),
      rows: await countRows(db, name),
    });
  }
  return { tables, foreignKeys };
}

async function countRows(db: RawDb, table: string): Promise<number> {
  const [row] = await db.$queryRawUnsafe<{ n: string }[]>(
    `SELECT count(*)::text AS n FROM ${quoteIdent(table)}`,
  );
  return Number(row?.n ?? 0);
}

export function backupTables(dump: Dump): BackupTable[] {
  return dump.tables.map(({ name, columns, rows }) => ({ name, columns, rows }));
}

/**
 * Writes the copy into the (empty) target and gives the row counts found
 * there afterwards. Call inside a transaction: any error leaves the target
 * as it was.
 */
export async function restoreDump(db: RawDb, dump: Dump): Promise<TableCount[]> {
  const steps = planRestore(backupTables(dump), await readTargetCatalog(db));
  const tableOf = (name: string) => dump.tables.find((table) => table.name === name)!;
  for (const step of steps) {
    const sql = insertSql(step);
    for (const batch of dumpBatches(dump, tableOf(step.table))) {
      await db.$executeRawUnsafe(sql, batch.json);
    }
  }
  for (const step of steps) {
    if (step.deferred.length === 0) continue;
    const sql = linkSql(step);
    for (const batch of dumpBatches(dump, tableOf(step.table))) {
      await db.$executeRawUnsafe(sql, batch.json);
    }
  }
  const counts: TableCount[] = [];
  for (const table of dump.tables) {
    if (table.rows === 0) continue;
    counts.push({ table: table.name, rows: await countRows(db, table.name) });
  }
  return counts;
}
