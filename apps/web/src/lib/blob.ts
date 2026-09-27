/**
 * Vercel Blob storage helpers.
 *
 * Токен читается лениво: без BLOB_READ_WRITE_TOKEN сборка и импорт модуля не
 * падают, а роуты, которым нужно хранилище, отвечают 503.
 */

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 МБ

export const UPLOAD_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type UploadAllowedType = (typeof UPLOAD_ALLOWED_TYPES)[number];

export function isAllowedUploadType(value: string): value is UploadAllowedType {
  return (UPLOAD_ALLOWED_TYPES as readonly string[]).includes(value);
}

export function getBlobToken(): string | undefined {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token && token.trim() ? token : undefined;
}

export function isBlobConfigured(): boolean {
  return getBlobToken() !== undefined;
}

/**
 * Хост Vercel Blob для публичных ссылок: `https://<store-id>.public.blob.vercel-storage.com/...`.
 * Используется, чтобы extract-specs скачивал только наши файлы, а не произвольные URL.
 */
export function isOurBlobUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
}
