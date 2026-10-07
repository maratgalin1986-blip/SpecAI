// Runs `prisma db push` with a fallback for DIRECT_URL.
//
// schema.prisma declares `directUrl = env("DIRECT_URL")`, and Prisma refuses
// to run any CLI command when a declared env var is missing — the build then
// fails before it even reaches the database. Deployments that only set
// DATABASE_URL (a plain, unpooled Postgres) can safely use it for DDL too.
import { spawnSync } from 'node:child_process';
import { isYandexDatabaseUrl, resolveDatabaseUrl } from '../src/connection';

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.info('[db:push] DIRECT_URL is not set, using DATABASE_URL for the schema push');
}

// Yandex Cloud needs TLS parameters on the connection string (see src/connection.ts).
for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
  const url = process.env[key];
  if (url && isYandexDatabaseUrl(url)) process.env[key] = resolveDatabaseUrl(url);
}

const result = spawnSync('prisma', ['db', 'push', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const status = result.status ?? 1;
// Preview deployments share one test database with every branch. A branch with
// another schema (claude/expo-eas-publish added Provider.verified and more tables
// on 2026-10-06) made `db push` refuse to drop its columns, and every other
// preview failed. A preview keeps building; production still stops on any error.
if (status !== 0 && process.env.VERCEL_ENV === 'preview') {
  console.warn('[db:push] schema push failed on a preview deployment, continuing without it');
  process.exit(0);
}
process.exit(status);
