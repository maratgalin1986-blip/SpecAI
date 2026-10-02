import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';

export const dynamic = 'force-dynamic';

// One-request production check: is the database reachable from the server
// functions? Returns the error class and Prisma code only, never secrets.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: 'ok' });
  } catch (error) {
    const e = error as { name?: string; errorCode?: string; code?: string };
    return NextResponse.json(
      {
        ok: false,
        database: 'error',
        error: e.name ?? 'Error',
        code: e.errorCode ?? e.code ?? null,
      },
      { status: 503 },
    );
  }
}
