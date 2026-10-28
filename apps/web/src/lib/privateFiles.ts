// Закрытые файлы: фото СТС и другие документы для проверки исполнителя.
// Всегда в базе (StoredFile), не в публичном Vercel Blob: открыть их могут
// только сама компания и админ площадки — GET /api/private-files/<key>.
// Публичный /api/files/<key> ключи с префиксом `private/` не отдаёт.

import { randomBytes } from 'node:crypto';

export const PRIVATE_PREFIX = 'private/';
export const PRIVATE_FILES_PATH = '/api/private-files/';

export function isPrivateKey(key: string): boolean {
  return key.startsWith(PRIVATE_PREFIX);
}

/** `private/verification/<companyId>/<random>-<name>`. */
export function privateVerificationKey(
  companyId: string,
  fileName: string,
  random: string = randomBytes(12).toString('base64url'),
): string {
  const safe = (fileName || 'file').replace(/[^\w.-]+/g, '_').slice(-60) || 'file';
  return `${PRIVATE_PREFIX}verification/${companyId}/${random}-${safe}`;
}

/** Компания, которой принадлежит закрытый файл; null — ключ не наш. */
export function privateKeyCompany(key: string): string | null {
  const match = /^private\/verification\/([A-Za-z0-9_-]{1,40})\/[^/]+$/.exec(key);
  return match ? match[1]! : null;
}

export function privateFileUrl(key: string): string {
  return `${PRIVATE_FILES_PATH}${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Ключ из адреса, который хранится в ProviderDocument.fileUrl. */
export function privateKeyFromUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith(PRIVATE_FILES_PATH)) return null;
  try {
    return url
      .slice(PRIVATE_FILES_PATH.length)
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join('/');
  } catch {
    return null;
  }
}

/** Кто может открыть: админ площадки или админ той же компании-исполнителя. */
export function canReadPrivateFile(
  key: string,
  viewer: { role?: string | null; companyId?: string | null } | null,
  isPlatformAdmin: boolean,
): boolean {
  const owner = privateKeyCompany(key);
  if (!owner) return false;
  if (isPlatformAdmin) return true;
  if (!viewer) return false;
  if (viewer.role === 'PLATFORM_ADMIN') return true;
  return viewer.role === 'PROVIDER_ADMIN' && viewer.companyId === owner;
}
