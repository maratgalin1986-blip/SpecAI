import { randomBytes } from 'node:crypto';
import { put } from '@vercel/blob';
import { prisma } from '@specai/database';
import { getBlobToken } from '@/lib/blob';
import { FILES_PATH } from '@/lib/fileUrls';
import { siteUrl } from '@/lib/siteUrl';

/**
 * Where uploads of signed-in providers and machinists live: Vercel Blob when it
 * is connected (BLOB_READ_WRITE_TOKEN), else the database (StoredFile), served
 * by GET /api/files/<key>. So photos and documents work without any Vercel
 * setting (owner, 2026-10-17: «сам всё делай»); connecting Blob later moves
 * new files there. Anonymous uploads (/api/photos) stay Blob-only.
 */

/** `equipment/<company>/photo.jpg` → `equipment/<company>/<random>-photo.jpg`. */
export function storedKey(path: string, random: string = randomBytes(9).toString('base64url')) {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = (path.slice(slash + 1) || 'file').replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  return `${dir ? `${dir}/` : ''}${random}-${name}`;
}

/**
 * How much the database may hold, so uploads can never fill the disk the
 * whole site runs on: per folder (a company's `equipment/<id>`) and in all.
 */
export const STORE_LIMITS = { perFolder: 200 * 1024 * 1024, total: 2 * 1024 * 1024 * 1024 };
export const STORE_FULL_MESSAGE =
  'Место для файлов закончилось — напишите нам, мы расширим хранилище';

export class StoreFullError extends Error {
  constructor() {
    super(STORE_FULL_MESSAGE);
  }
}

/** Saves an upload and returns its public https URL (StoreFullError over the limits). */
export async function storeFile(path: string, file: File): Promise<string> {
  const token = getBlobToken();
  if (token) {
    const blob = await put(path, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });
    return blob.url;
  }
  const key = storedKey(path);
  const folder = key.slice(0, key.lastIndexOf('/') + 1);
  const [inFolder, inAll] = await Promise.all([
    prisma.storedFile.aggregate({ where: { key: { startsWith: folder } }, _sum: { size: true } }),
    prisma.storedFile.aggregate({ _sum: { size: true } }),
  ]);
  if (
    (inFolder._sum.size ?? 0) + file.size > STORE_LIMITS.perFolder ||
    (inAll._sum.size ?? 0) + file.size > STORE_LIMITS.total
  ) {
    throw new StoreFullError();
  }
  await prisma.storedFile.create({
    data: {
      key,
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      size: file.size,
    },
  });
  return `${siteUrl()}${FILES_PATH}${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** The bytes of a file this site keeps itself (extract-specs reads them without a request). */
export async function loadStoredFile(key: string) {
  return prisma.storedFile.findUnique({ where: { key } });
}
