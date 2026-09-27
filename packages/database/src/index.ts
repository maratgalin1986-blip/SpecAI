import { PrismaClient } from '../generated/client';
import { resolveDatabaseUrl } from './connection';

/** A Prisma client that also handles Yandex Cloud TLS (see connection.ts). */
export function createPrismaClient() {
  const url = resolveDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

declare global {
  var __specaiPrisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in development so we don't
// exhaust the Postgres connection pool.
export const prisma = globalThis.__specaiPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__specaiPrisma = prisma;
}

export * from '../generated/client';

// The site owner's own company (СпецПласт16) whose fleet is published by
// prisma/ensure-fleet.ts. Fixed id so the fleet can be linked to an account.
export const HOUSE_COMPANY_ID = 'specplast16-house';

export { isYandexDatabaseUrl, resolveDatabaseUrl, withYandexTls } from './connection';
