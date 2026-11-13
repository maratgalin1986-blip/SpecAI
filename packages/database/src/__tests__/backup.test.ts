import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_HEADER_BYTES,
  BACKUP_TAG_BYTES,
  BackupError,
  BackupTimeoutError,
  BackupVerifyError,
  RestoreRefusedError,
  batchRows,
  buildBackup,
  compareCounts,
  decryptBackup,
  dumpBatches,
  dumpCounts,
  encryptBackup,
  insertSql,
  linkSql,
  planRestore,
  readDump,
  writeDump,
  type SnapshotReader,
  type TargetCatalog,
  type TargetTable,
} from '../backup';

const SECRET = 'test-secret-not-a-real-one';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof BackupError) return error.code;
    throw error;
  }
  return 'no error';
}

/** A fake database: table name → rows as PostgreSQL would print them. */
function fakeReader(
  data: Record<string, string[]>,
  overrides: Partial<SnapshotReader> = {},
): SnapshotReader {
  return {
    tables: async () => Object.keys(data).sort(),
    count: async (table) => data[table]!.length,
    async *rows(table) {
      const rows = data[table]!;
      for (let index = 0; index < rows.length; index += 2) yield rows.slice(index, index + 2);
    },
    ...overrides,
  };
}

const DATA = {
  Company: ['{"id": "c1", "name": "ООО «Ромашка»"}'],
  Empty: [],
  User: [
    '{"id": "u1", "note": "строка\\nвторая", "price": 12345678901234567890.12}',
    '{"id": "u2", "note": null, "price": 1.10}',
    '{"id": "u3", "note": "#table \\"User\\"", "price": 0}',
  ],
};

describe('encryptBackup / decryptBackup', () => {
  it('gives the same bytes back', () => {
    const data = randomBytes(10_000);
    const parts = encryptBackup(data, SECRET);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.includes(data.subarray(0, 32))).toBe(false);
    expect(decryptBackup(parts, SECRET).equals(data)).toBe(true);
  });

  it('handles an empty copy', () => {
    expect(decryptBackup(encryptBackup(Buffer.alloc(0), SECRET), SECRET)).toHaveLength(0);
  });

  it('never writes two copies of the same data alike', () => {
    const data = Buffer.from('the same');
    const [first] = encryptBackup(data, SECRET);
    const [second] = encryptBackup(data, SECRET);
    expect(first!.equals(second!)).toBe(false);
  });

  it('says so when the key is wrong', () => {
    const parts = encryptBackup(randomBytes(100), SECRET);
    expect(codeOf(() => decryptBackup(parts, 'another-secret'))).toBe('wrong-key');
    expect(() => decryptBackup(parts, 'another-secret')).toThrow(/CRON_SECRET/);
    expect(codeOf(() => decryptBackup(parts, ''))).toBe('no-key');
  });

  it('notices a changed byte anywhere in the file', () => {
    const [part] = encryptBackup(randomBytes(300), SECRET);
    const places = [
      9, // salt
      27, // key check
      35, // copy id
      BACKUP_HEADER_BYTES - 1, // nonce
      BACKUP_HEADER_BYTES + 5, // content
      part!.length - 1, // tag
    ];
    for (const place of places) {
      const broken = Buffer.from(part!);
      broken[place] = broken[place]! ^ 0x01;
      expect(['damaged', 'wrong-key'], `byte ${place}`).toContain(
        codeOf(() => decryptBackup([broken], SECRET)),
      );
    }
    const content = Buffer.from(part!);
    content[BACKUP_HEADER_BYTES + 5] = content[BACKUP_HEADER_BYTES + 5]! ^ 0x01;
    expect(codeOf(() => decryptBackup([content], SECRET))).toBe('damaged');
    // A cut-off file.
    expect(codeOf(() => decryptBackup([part!.subarray(0, part!.length - 7)], SECRET))).toBe(
      'damaged',
    );
    expect(codeOf(() => decryptBackup([part!.subarray(0, 20)], SECRET))).toBe('damaged');
  });

  it('refuses a file that is not a copy, and a newer format', () => {
    expect(codeOf(() => decryptBackup([Buffer.from('%PDF-1.7 something else')], SECRET))).toBe(
      'not-a-backup',
    );
    expect(codeOf(() => decryptBackup([], SECRET))).toBe('parts');
    const [part] = encryptBackup(randomBytes(10), SECRET);
    const newer = Buffer.from(part!);
    newer[8] = 2;
    expect(codeOf(() => decryptBackup([newer], SECRET))).toBe('version');
  });

  it('splits a large copy into parts of the given size', () => {
    const data = randomBytes(10_000);
    const parts = encryptBackup(data, SECRET, 3_000);
    const room = 3_000 - BACKUP_HEADER_BYTES - BACKUP_TAG_BYTES;
    expect(parts).toHaveLength(Math.ceil(10_000 / room));
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(3_000);
    expect(parts.slice(0, -1).every((part) => part.length === 3_000)).toBe(true);
    // Any order of files.
    expect(decryptBackup([...parts].reverse(), SECRET).equals(data)).toBe(true);
    // Exactly one part when the data fits to the byte.
    expect(encryptBackup(randomBytes(room), SECRET, 3_000)).toHaveLength(1);
    expect(encryptBackup(randomBytes(room + 1), SECRET, 3_000)).toHaveLength(2);
  });

  it('needs every part, once, and from one copy', () => {
    const parts = encryptBackup(randomBytes(10_000), SECRET, 3_000);
    expect(() => decryptBackup([parts[0]!, parts[2]!, parts[3]!], SECRET)).toThrow(
      /Не хватает частей копии: 2 из 4/,
    );
    expect(codeOf(() => decryptBackup([...parts, parts[1]!], SECRET))).toBe('parts');
    const other = encryptBackup(randomBytes(10_000), SECRET, 3_000);
    expect(codeOf(() => decryptBackup([parts[0]!, other[1]!, parts[2]!, parts[3]!], SECRET))).toBe(
      'parts',
    );
    // A part put in another part's place.
    const swapped = Buffer.from(parts[1]!);
    swapped.writeUInt16BE(0, 41);
    const zero = Buffer.from(parts[0]!);
    zero.writeUInt16BE(1, 41);
    expect(codeOf(() => decryptBackup([swapped, zero, parts[2]!, parts[3]!], SECRET))).toBe(
      'damaged',
    );
  });
});

describe('the dump', () => {
  it('keeps every row exactly as the database printed it', async () => {
    const { compressed, counts } = await writeDump(fakeReader(DATA), {
      createdAt: new Date('2026-11-12T00:10:00Z'),
    });
    expect(counts).toEqual([
      { table: 'Company', rows: 1 },
      { table: 'Empty', rows: 0 },
      { table: 'User', rows: 3 },
    ]);
    const dump = readDump(compressed);
    expect(dump.createdAt).toBe('2026-11-12T00:10:00.000Z');
    expect(dumpCounts(dump)).toEqual(counts);
    const user = dump.tables.find((table) => table.name === 'User')!;
    expect(user.columns).toEqual(['id', 'note', 'price']);
    expect(dump.tables.find((table) => table.name === 'Empty')!.columns).toEqual([]);
    // The long number is not rounded: rows are never parsed on the way.
    expect([...dumpBatches(dump, user)]).toEqual([{ json: `[${DATA.User.join(',')}]`, rows: 3 }]);
    expect([...dumpBatches(dump, user, 2)].map((batch) => batch.rows)).toEqual([2, 1]);
    expect([...dumpBatches(dump, user, 500, 1)].map((batch) => batch.rows)).toEqual([1, 1, 1]);
    expect([...dumpBatches(dump, dump.tables[1]!)]).toEqual([]);
  });

  it('notices a cut-off or foreign content', () => {
    const lines = [
      '#iistroyka24-backup {"version":1,"createdAt":"2026-11-12T00:10:00.000Z"}',
      '#table "User"',
      '{"id": "u1"}',
      '{"id": "u2"}',
      '#end {"tables":1,"rows":2}',
    ];
    const pack = (text: string[]) => gzipSync(Buffer.from(`${text.join('\n')}\n`));
    expect(dumpCounts(readDump(pack(lines)))).toEqual([{ table: 'User', rows: 2 }]);
    expect(codeOf(() => readDump(pack(lines.slice(0, 4))))).toBe('damaged');
    expect(codeOf(() => readDump(pack([...lines.slice(0, 3), lines[4]!])))).toBe('damaged');
    expect(codeOf(() => readDump(pack(lines.slice(1))))).toBe('damaged');
    expect(codeOf(() => readDump(pack([...lines, '{"id": "u3"}'])))).toBe('damaged');
    expect(codeOf(() => readDump(pack(['hello'])))).toBe('damaged');
    expect(codeOf(() => readDump(Buffer.from('not gzip')))).toBe('damaged');
  });

  it('compares row counts table by table', () => {
    const expected = [
      { table: 'A', rows: 2 },
      { table: 'B', rows: 0 },
    ];
    expect(compareCounts(expected, expected)).toEqual([]);
    expect(
      compareCounts(expected, [
        { table: 'A', rows: 1 },
        { table: 'C', rows: 5 },
      ]),
    ).toEqual(['A: в базе 2, в копии 1', 'B: таблицы нет в копии', 'C: лишняя таблица в копии']);
  });
});

describe('buildBackup', () => {
  it('makes encrypted parts and proves they can be read back', async () => {
    const built = await buildBackup(fakeReader(DATA), SECRET, {
      createdAt: new Date('2026-11-12T00:10:00Z'),
      partBytes: 150,
    });
    expect(built.tables).toBe(3);
    expect(built.rows).toBe(4);
    expect(built.parts.length).toBeGreaterThan(1);
    expect(built.bytes).toBe(built.parts.reduce((sum, part) => sum + part.length, 0));
    for (const part of built.parts) expect(part.toString('utf8')).not.toContain('Ромашка');
    const dump = readDump(decryptBackup(built.parts, SECRET));
    expect(dumpCounts(dump)).toEqual(built.counts);
  });

  it('fails when the copy holds other row counts than the database', async () => {
    // The database says 4 rows, the copy got 3.
    const reader = fakeReader(DATA, { count: async (table) => (table === 'User' ? 4 : 1) });
    const error = await buildBackup(reader, SECRET).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackupVerifyError);
    expect((error as BackupVerifyError).problems).toEqual([
      'Empty: в базе 1, в копии 0',
      'User: в базе 4, в копии 3',
    ]);
  });

  it('stops when the time is over', async () => {
    await expect(buildBackup(fakeReader(DATA), SECRET, { deadline: 1 })).rejects.toBeInstanceOf(
      BackupTimeoutError,
    );
  });

  it('refuses rows that are not single-line objects', async () => {
    const reader = fakeReader({ User: ['{"id":\n"u1"}'] });
    await expect(buildBackup(reader, SECRET)).rejects.toThrow('unexpected row shape');
  });

  it('reads tables with files a few rows at a time', () => {
    expect(batchRows(0, 0, 8_000_000)).toBe(500);
    expect(batchRows(10_000, 100, 8_000_000)).toBe(500);
    expect(batchRows(400_000_000, 100, 8_000_000)).toBe(2);
    expect(batchRows(4_000_000_000, 10, 8_000_000)).toBe(1);
  });
});

describe('planRestore', () => {
  const table = (
    name: string,
    columns: string[],
    options: { rows?: number; nullable?: string[]; primaryKey?: string[] } = {},
  ): TargetTable => ({
    name,
    columns: columns.map((column) => ({
      name: column,
      nullable: options.nullable?.includes(column) ?? false,
      hasDefault: false,
    })),
    primaryKey: options.primaryKey ?? ['id'],
    rows: options.rows ?? 0,
  });
  const backup = [
    { name: 'Order', columns: ['id', 'userId'], rows: 5 },
    { name: 'User', columns: ['id', 'companyId'], rows: 2 },
    { name: 'Company', columns: ['id', 'ownerId'], rows: 1 },
    { name: 'Category', columns: ['id', 'parentId'], rows: 3 },
    { name: 'Unused', columns: [], rows: 0 },
  ];
  const catalog = (rows: Record<string, number> = {}): TargetCatalog => ({
    tables: [
      table('Order', ['id', 'userId'], { rows: rows.Order }),
      table('User', ['id', 'companyId'], { rows: rows.User }),
      table('Company', ['id', 'ownerId'], { nullable: ['ownerId'], rows: rows.Company }),
      table('Category', ['id', 'parentId'], { nullable: ['parentId'] }),
      table('Extra', ['id'], { rows: rows.Extra }),
    ],
    foreignKeys: [
      { table: 'Order', columns: ['userId'], references: 'User' },
      { table: 'User', columns: ['companyId'], references: 'Company' },
      { table: 'Company', columns: ['ownerId'], references: 'User' },
      { table: 'Category', columns: ['parentId'], references: 'Category' },
    ],
  });

  it('refuses a database that holds any row', () => {
    const cases: Record<string, number>[] = [{ Order: 1 }, { Extra: 3 }];
    for (const rows of cases) {
      const error = (() => {
        try {
          planRestore(backup, catalog(rows));
        } catch (caught) {
          return caught;
        }
        return null;
      })();
      expect(error).toBeInstanceOf(RestoreRefusedError);
      expect((error as RestoreRefusedError).message).toMatch(/только в пустую базу/);
      expect((error as RestoreRefusedError).message).toMatch(/Ничего не изменено/);
    }
    expect(() => planRestore(backup, catalog({ Extra: 3 }))).toThrow(/Extra: строк — 3/);
  });

  it('orders tables by their links and leaves circles for a second pass', () => {
    const steps = planRestore(backup, catalog());
    const order = steps.map((step) => step.table);
    expect(order).toEqual(['Category', 'Company', 'User', 'Order']);
    expect(order).not.toContain('Unused');
    const byName = Object.fromEntries(steps.map((step) => [step.table, step]));
    // The table that refers to itself, and the optional side of the circle.
    expect(byName.Category).toMatchObject({ columns: ['id'], deferred: ['parentId'] });
    expect(byName.Company).toMatchObject({ columns: ['id'], deferred: ['ownerId'] });
    expect(byName.User).toMatchObject({ columns: ['id', 'companyId'], deferred: [] });
    expect(insertSql(byName.User!)).toBe(
      'INSERT INTO "User" ("id", "companyId") SELECT "id", "companyId" FROM jsonb_populate_recordset(NULL::"User", $1::jsonb)',
    );
    expect(linkSql(byName.Company!)).toBe(
      'UPDATE "Company" AS t SET "ownerId" = r."ownerId" FROM jsonb_populate_recordset(NULL::"Company", $1::jsonb) AS r WHERE t."id" = r."id" AND (r."ownerId" IS NOT NULL)',
    );
  });

  it('refuses when tables do not match the copy', () => {
    const base = catalog();
    const without = { ...base, tables: base.tables.filter((entry) => entry.name !== 'Order') };
    expect(() => planRestore(backup, without)).toThrow(/нет таблицы Order/);
    const fewer = {
      ...base,
      tables: base.tables.map((entry) => (entry.name === 'Order' ? table('Order', ['id']) : entry)),
    };
    expect(() => planRestore(backup, fewer)).toThrow(/нет колонок из копии: userId/);
    const more = {
      ...base,
      tables: base.tables.map((entry) =>
        entry.name === 'Order' ? table('Order', ['id', 'userId', 'mustHave']) : entry,
      ),
    };
    expect(() => planRestore(backup, more)).toThrow(/обязательные колонки.*mustHave/);
  });

  it('refuses a circle of required links', () => {
    const base = catalog();
    const strict = {
      ...base,
      tables: base.tables.map((entry) =>
        entry.name === 'Company' ? table('Company', ['id', 'ownerId']) : entry,
      ),
    };
    expect(() => planRestore(backup, strict)).toThrow(/по кругу/);
  });
});
