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

// The site owner's own company (СпецПласт16) whose fleet is published by
// prisma/ensure-fleet.ts. Fixed id so the fleet can be linked to an account.
export const HOUSE_COMPANY_ID = 'specplast16-house';
