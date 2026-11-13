import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackupTimeoutError,
  BackupVerifyError,
  buildBackup,
  decryptBackup,
  dumpCounts,
  readDump,
  type SnapshotReader,
} from '@specai/database/src/backup';
import {
  backupCaption,
  backupDateLabel,
  backupFileName,
  formatBytes,
  runBackup,
  type BackupDeps,
} from './backup';
import { ownerPrivateChatId, sendOwnerDocument } from './backupSend';

const SECRET = 'test-secret-not-a-real-one';
const AT = new Date('2026-11-12T00:10:00Z'); // 03:10 in Moscow

const PRIVATE = 'Иван Петров +7 900 000-00-00';
const reader: SnapshotReader = {
  tables: async () => ['Order', 'User'],
  count: async (table) => (table === 'User' ? 2 : 1),
  async *rows(table) {
    yield table === 'User'
      ? [`{"id": "u1", "name": "${PRIVATE}"}`, '{"id": "u2", "name": null}']
      : ['{"id": "o1"}'];
  },
};

function deps(overrides: Partial<BackupDeps> = {}) {
  const sent: { file: Buffer; name: string; caption: string }[] = [];
  const notes: string[] = [];
  const all: BackupDeps = {
    hasChat: () => true,
    build: (deadline) => buildBackup(reader, SECRET, { createdAt: AT, deadline, partBytes: 140 }),
    sendFile: async (file, name, caption) => {
      sent.push({ file, name, caption });
      return true;
    },
    notify: async (text) => {
      notes.push(text);
      return true;
    },
    ...overrides,
  };
  return { all, sent, notes };
}

describe('texts of the database copy', () => {
  it('dates by Moscow time', () => {
    expect(backupDateLabel(AT)).toBe('12.11.2026 03:10');
    expect(backupDateLabel(new Date('2026-12-31T22:05:00Z'))).toBe('01.01.2027 01:05');
    expect(backupFileName(AT, 1, 3)).toBe('iistroyka24-2026-11-12-0310-1of3.bkp');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(20_480)).toBe('20 КБ');
    expect(formatBytes(1_300_000)).toBe('1,2 МБ');
  });

  it('writes the caption: date, tables, rows, size, the restore check', () => {
    const numbers = { createdAt: AT, tables: 41, rows: 12_345, bytes: 1_300_000, parts: 1 };
    const caption = backupCaption(numbers, 1);
    expect(caption).toContain('от 12.11.2026 03:10 МСК');
    expect(caption).toMatch(/Таблиц: 41, строк: 12\s345, размер: 1,2 МБ/);
    expect(caption).toContain('Проверка восстановления пройдена');
    expect(caption).not.toContain('Часть');
    expect(backupCaption({ ...numbers, parts: 3 }, 2)).toContain('Часть 2 из 3');
    // Telegram's limit for a caption.
    expect(backupCaption({ ...numbers, parts: 3 }, 2).length).toBeLessThan(1024);
  });
});

describe('runBackup', () => {
  it('sends every part with its caption and answers numbers only', async () => {
    const { all, sent, notes } = deps();
    const outcome = await runBackup(all);
    expect(outcome).toEqual({
      ok: true,
      tables: 2,
      rows: 3,
      bytes: sent.reduce((sum, part) => sum + part.file.length, 0),
      parts: sent.length,
    });
    expect(sent.length).toBeGreaterThan(1);
    expect(notes).toEqual([]);
    expect(sent.map((part) => part.name)).toEqual(
      sent.map((_, index) => `iistroyka24-2026-11-12-0310-${index + 1}of${sent.length}.bkp`),
    );
    expect(sent[0]!.caption).toContain(`Часть 1 из ${sent.length}`);
    for (const part of sent) {
      expect(part.caption).toContain('Таблиц: 2, строк: 3');
      expect(part.caption + JSON.stringify(outcome)).not.toContain('Иван');
      expect(part.file.toString('utf8')).not.toContain('Иван');
    }
    // What was sent restores to the same rows.
    const dump = readDump(
      decryptBackup(
        sent.map((part) => part.file),
        SECRET,
      ),
    );
    expect(dumpCounts(dump)).toEqual([
      { table: 'Order', rows: 1 },
      { table: 'User', rows: 2 },
    ]);
    expect(dump.plain.toString('utf8')).toContain(PRIVATE);
  });

  it('builds nothing when there is no chat to send to', async () => {
    const build = vi.fn();
    const { all, notes } = deps({ hasChat: () => false, build });
    expect(await runBackup(all)).toEqual({ ok: false, failed: 'no-chat' });
    expect(build).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });

  it('tells the owner briefly, with no details, when the copy fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cases: [unknown, string][] = [
      [new BackupVerifyError(['User: в базе 2, в копии 1']), 'verify'],
      [new BackupTimeoutError(), 'timeout'],
      [new Error(`duplicate key (${PRIVATE})`), 'build'],
    ];
    for (const [error, failed] of cases) {
      const { all, sent, notes } = deps({ build: () => Promise.reject(error) });
      expect(await runBackup(all)).toEqual({ ok: false, failed });
      expect(sent).toEqual([]);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(
        /^⚠️ Копия базы «.+» от \d\d\.\d\d\.\d{4} \d\d:\d\d МСК не создана\./,
      );
      expect(notes[0]).toContain('не создана');
      expect(notes[0]).not.toMatch(/User|duplicate|Иван|timeout/);
    }
    // The log never quotes a database error.
    expect(JSON.stringify(log.mock.calls)).not.toContain('Иван');
    log.mockRestore();
  });

  it('reports a part Telegram did not take', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const { all, notes } = deps({ sendFile: async () => (calls += 1) < 2 });
    expect(await runBackup(all)).toEqual({ ok: false, failed: 'send', sent: 1 });
    expect(notes).toHaveLength(1);
    log.mockRestore();
  });

  it('gives the build a deadline inside the function time', async () => {
    const build = vi.fn().mockRejectedValue(new BackupTimeoutError());
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await runBackup(deps({ build, now: () => 1_000_000 }).all);
    expect(build).toHaveBeenCalledWith(1_035_000);
    log.mockRestore();
  });
});

describe('sending to the owner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('accepts the owner’s private chat only', () => {
    expect(ownerPrivateChatId({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: ' 12345 ' })).toBe(
      '12345',
    );
    // A group or a channel.
    expect(ownerPrivateChatId({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-100123' })).toBeNull();
    expect(
      ownerPrivateChatId({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '@channel' }),
    ).toBeNull();
    expect(ownerPrivateChatId({ TELEGRAM_CHAT_ID: '12345' })).toBeNull();
    expect(ownerPrivateChatId({ TELEGRAM_BOT_TOKEN: 't' })).toBeNull();
  });

  it('posts the file as a document', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendOwnerDocument(Buffer.from('abc'), 'copy.bkp', 'Подпись', 5_000)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/botbot-token/sendDocument');
    const form = init.body as FormData;
    expect(form.get('chat_id')).toBe('12345');
    expect(form.get('caption')).toBe('Подпись');
    const file = form.get('document') as File;
    expect(file.name).toBe('copy.bkp');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('abc');
  });

  it('answers false on a refusal, an error, a group chat or no time left', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 413 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendOwnerDocument(Buffer.from('abc'), 'copy.bkp', 'x', 5_000)).toBe(false);
    fetchMock.mockRejectedValue(new Error('https://api.telegram.org/botbot-token/ failed'));
    expect(await sendOwnerDocument(Buffer.from('abc'), 'copy.bkp', 'x', 5_000)).toBe(false);
    // The token never reaches the log.
    expect(JSON.stringify(log.mock.calls)).not.toContain('bot-token');
    fetchMock.mockClear();
    expect(await sendOwnerDocument(Buffer.from('abc'), 'copy.bkp', 'x', 0)).toBe(false);
    vi.stubEnv('TELEGRAM_CHAT_ID', '-100123');
    expect(await sendOwnerDocument(Buffer.from('abc'), 'copy.bkp', 'x', 5_000)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
