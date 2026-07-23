import { PrismaClient } from '../generated/client';

declare global {
  var __specaiPrisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in development so we don't
// exhaust the Postgres connection pool.
export const prisma = globalThis.__specaiPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__specaiPrisma = prisma;
}

export * from '../generated/client';
