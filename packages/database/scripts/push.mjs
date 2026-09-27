// Runs `prisma db push`, falling back to DATABASE_URL when DIRECT_URL isn't
// set. The schema's `directUrl = env("DIRECT_URL")` makes Prisma refuse to
// push at all without it, which broke deployments whose environment only
// defines DATABASE_URL (e.g. a plain, unpooled Postgres).
/* global process, console */
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
if (!env.DIRECT_URL && env.DATABASE_URL) {
  console.warn('DIRECT_URL is not set — using DATABASE_URL for schema push.');
  env.DIRECT_URL = env.DATABASE_URL;
}

const result = spawnSync('prisma', ['db', 'push', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
