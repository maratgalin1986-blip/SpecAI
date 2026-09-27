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

process.exit(result.status ?? 1);
