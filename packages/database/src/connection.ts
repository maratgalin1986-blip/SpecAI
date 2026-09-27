import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { YANDEX_CA } from './certs/yandexCa';

// Yandex Managed PostgreSQL only accepts TLS connections, and its certificate
// is signed by Yandex's own root CA, which isn't in the default trust store.
// These helpers add the TLS parameters Prisma needs for such hosts; any other
// database URL is returned untouched.

const YANDEX_HOST_SUFFIX = '.mdb.yandexcloud.net';

export function isYandexDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith(YANDEX_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * Adds `sslmode=require` plus either the CA file to verify against (`sslcert`
 * with `sslaccept=strict`) or, when no CA is available,
 * `sslaccept=accept_invalid_certs` (encrypted but unverified). Explicit TLS settings already in the URL are respected.
 */
export function withYandexTls(url: string, caPath: string | null): string {
  if (!isYandexDatabaseUrl(url)) return url;
  const parsed = new URL(url);
  if (parsed.searchParams.has('sslcert') || parsed.searchParams.has('sslaccept')) return url;
  parsed.searchParams.set('sslmode', 'require');
  if (caPath) {
    parsed.searchParams.set('sslcert', caPath);
    // Prisma only verifies the server certificate with an explicit `strict`;
    // otherwise any certificate is accepted (checked against a real server).
    parsed.searchParams.set('sslaccept', 'strict');
  } else {
    parsed.searchParams.set('sslaccept', 'accept_invalid_certs');
  }
  return parsed.toString();
}

let caPathCache: string | null | undefined;

/** Writes the bundled Yandex CA to a temp file once and returns its path. */
function yandexCaPath(): string | null {
  if (caPathCache !== undefined) return caPathCache;
  if (!YANDEX_CA.trim()) {
    console.warn(
      '[database] Yandex root CA is not bundled — connecting with TLS but without ' +
        'certificate verification. Rebuild with internet access to fetch it.',
    );
    caPathCache = null;
    return null;
  }
  const path = join(tmpdir(), 'yandex-cloud-root-ca.pem');
  if (!existsSync(path)) writeFileSync(path, YANDEX_CA);
  caPathCache = path;
  return path;
}

/** The URL to actually connect with (adds Yandex TLS settings when needed). */
export function resolveDatabaseUrl(url: string | undefined): string | undefined {
  if (!url || !isYandexDatabaseUrl(url)) return url;
  return withYandexTls(url, yandexCaPath());
}
