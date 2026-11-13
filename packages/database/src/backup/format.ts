// The file format of the weekly database copy (docs/backup.md).
//
// A copy is one or several parts. Every part is a file of its own:
//
//   magic "IIS24BKP" (8) | version (1) | salt (16) | key check (8) |
//   copy id (8) | part index (2) | part count (2) | nonce (12) |
//   ciphertext | tag (16)
//
// The key is scrypt(secret, salt); the content is AES-256-GCM with the header
// as additional authenticated data, so a changed byte anywhere (header
// included), a part from another copy or a part in the wrong place is
// noticed. The key check tells «wrong key» from «damaged file».
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const BACKUP_MAGIC = Buffer.from('IIS24BKP', 'ascii');
export const BACKUP_VERSION = 1;
/** Telegram accepts files up to 50 MB from a bot; parts stay under it. */
export const BACKUP_PART_BYTES = 45 * 1024 * 1024;

const SALT_BYTES = 16;
const KEY_CHECK_BYTES = 8;
const COPY_ID_BYTES = 8;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const OFFSET_VERSION = BACKUP_MAGIC.length;
const OFFSET_SALT = OFFSET_VERSION + 1;
const OFFSET_KEY_CHECK = OFFSET_SALT + SALT_BYTES;
const OFFSET_COPY_ID = OFFSET_KEY_CHECK + KEY_CHECK_BYTES;
const OFFSET_PART_INDEX = OFFSET_COPY_ID + COPY_ID_BYTES;
const OFFSET_PART_COUNT = OFFSET_PART_INDEX + 2;
const OFFSET_NONCE = OFFSET_PART_COUNT + 2;
export const BACKUP_HEADER_BYTES = OFFSET_NONCE + NONCE_BYTES;
export const BACKUP_TAG_BYTES = TAG_BYTES;
const MAX_PARTS = 0xffff;

// Fixed for format version 1.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export type BackupErrorCode =
  'no-key' | 'not-a-backup' | 'version' | 'wrong-key' | 'damaged' | 'parts';

/** An error whose message is ready to show to the person restoring. */
export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  if (!secret) {
    throw new BackupError('no-key', 'Не задан ключ: переменная CRON_SECRET пуста.');
  }
  return scryptSync(secret, salt, 32, SCRYPT);
}

function keyCheck(key: Buffer): Buffer {
  return createHmac('sha256', key)
    .update('iistroyka24-backup-key-check')
    .digest()
    .subarray(0, KEY_CHECK_BYTES);
}

/**
 * Encrypts the (already compressed) copy into parts of at most `partBytes`
 * each, header and tag included.
 */
export function encryptBackup(
  data: Buffer,
  secret: string,
  partBytes: number = BACKUP_PART_BYTES,
): Buffer[] {
  const room = partBytes - BACKUP_HEADER_BYTES - TAG_BYTES;
  if (room < 1) throw new Error('part size is too small');
  const partCount = Math.max(1, Math.ceil(data.length / room));
  if (partCount > MAX_PARTS) throw new Error('too many parts');
  const salt = randomBytes(SALT_BYTES);
  const key = deriveKey(secret, salt);
  const check = keyCheck(key);
  const copyId = randomBytes(COPY_ID_BYTES);
  const parts: Buffer[] = [];
  for (let index = 0; index < partCount; index += 1) {
    const header = Buffer.alloc(BACKUP_HEADER_BYTES);
    BACKUP_MAGIC.copy(header, 0);
    header.writeUInt8(BACKUP_VERSION, OFFSET_VERSION);
    salt.copy(header, OFFSET_SALT);
    check.copy(header, OFFSET_KEY_CHECK);
    copyId.copy(header, OFFSET_COPY_ID);
    header.writeUInt16BE(index, OFFSET_PART_INDEX);
    header.writeUInt16BE(partCount, OFFSET_PART_COUNT);
    // A fresh random nonce for every part under the same key.
    randomBytes(NONCE_BYTES).copy(header, OFFSET_NONCE);
    const cipher = createCipheriv('aes-256-gcm', key, header.subarray(OFFSET_NONCE));
    cipher.setAAD(header);
    const body = Buffer.concat([
      cipher.update(data.subarray(index * room, (index + 1) * room)),
      cipher.final(),
    ]);
    parts.push(Buffer.concat([header, body, cipher.getAuthTag()]));
  }
  return parts;
}

interface ParsedPart {
  header: Buffer;
  salt: Buffer;
  check: Buffer;
  copyId: string;
  index: number;
  count: number;
  body: Buffer;
  tag: Buffer;
}

function parsePart(part: Buffer): ParsedPart {
  if (
    part.length < BACKUP_MAGIC.length ||
    !part.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)
  ) {
    throw new BackupError('not-a-backup', 'Это не файл копии базы «ИИСтройка24».');
  }
  if (part.length < BACKUP_HEADER_BYTES + TAG_BYTES) {
    throw new BackupError('damaged', 'Файл копии повреждён: он короче, чем должен быть.');
  }
  const version = part.readUInt8(OFFSET_VERSION);
  if (version !== BACKUP_VERSION) {
    throw new BackupError(
      'version',
      `Копия записана в формате версии ${version}, а эта программа читает версию ${BACKUP_VERSION}. Возьмите свежую версию программы.`,
    );
  }
  return {
    header: part.subarray(0, BACKUP_HEADER_BYTES),
    salt: part.subarray(OFFSET_SALT, OFFSET_KEY_CHECK),
    check: part.subarray(OFFSET_KEY_CHECK, OFFSET_COPY_ID),
    copyId: part.subarray(OFFSET_COPY_ID, OFFSET_PART_INDEX).toString('hex'),
    index: part.readUInt16BE(OFFSET_PART_INDEX),
    count: part.readUInt16BE(OFFSET_PART_COUNT),
    body: part.subarray(BACKUP_HEADER_BYTES, part.length - TAG_BYTES),
    tag: part.subarray(part.length - TAG_BYTES),
  };
}

const DAMAGED = 'Файл копии повреждён: содержимое изменено. Скачайте файл из чата ещё раз.';

/**
 * Decrypts the parts of one copy, given in any order, into the compressed
 * copy. Throws a BackupError that says what is wrong: not a copy, a wrong
 * key, a damaged file, missing or foreign parts.
 */
export function decryptBackup(files: Buffer[], secret: string): Buffer {
  if (files.length === 0) throw new BackupError('parts', 'Не передано ни одного файла копии.');
  const parts = files.map(parsePart);
  const first = parts[0]!;
  const key = deriveKey(secret, first.salt);
  const check = keyCheck(key);
  const ordered = new Array<ParsedPart | undefined>(first.count).fill(undefined);
  for (const part of parts) {
    if (part.copyId !== first.copyId || part.count !== first.count) {
      throw new BackupError(
        'parts',
        'Файлы относятся к разным копиям. Возьмите все части одной копии — у них одна дата и время в названии.',
      );
    }
    if (part.index >= part.count || ordered[part.index]) {
      throw new BackupError('parts', 'Одна и та же часть копии передана дважды.');
    }
    ordered[part.index] = part;
  }
  const missing: number[] = [];
  ordered.forEach((part, index) => {
    if (!part) missing.push(index + 1);
  });
  if (missing.length > 0) {
    throw new BackupError(
      'parts',
      `Не хватает частей копии: ${missing.join(', ')} из ${first.count}. Нужны все части.`,
    );
  }
  const chunks: Buffer[] = [];
  for (const part of ordered as ParsedPart[]) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      part.header.subarray(OFFSET_NONCE, BACKUP_HEADER_BYTES),
    );
    decipher.setAAD(part.header);
    decipher.setAuthTag(part.tag);
    try {
      chunks.push(decipher.update(part.body), decipher.final());
    } catch {
      // The right key reproduces the key check of the header; when it does,
      // the key is fine and the file itself has changed.
      if (timingSafeEqual(part.check, check)) throw new BackupError('damaged', DAMAGED);
      throw new BackupError(
        'wrong-key',
        'Ключ не подходит: копия зашифрована другим значением CRON_SECRET. ' +
          'Укажите значение, которое действовало в день создания копии.',
      );
    }
  }
  return Buffer.concat(chunks);
}
