import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { integrationFlags } from '@/lib/integrationFlags';
import { SEARCH_HEALTH_RUNS, searchHealth, type SearchHealth } from '@/lib/office/searchHealth';

export const dynamic = 'force-dynamic';

// One-request production check: is the database reachable from the server
// functions? Returns the error class and Prisma code only, never secrets.
// `office` says whether the agents' search for companies works (lib/office/searchHealth.ts):
// a word, a time and the run's counts — no names, phones or ids. A cloud session without the
// admin password reads it to see that the search really runs in production.
async function officeHealth(): Promise<(SearchHealth & { queue: Record<string, number> }) | null> {
  try {
    const runs = await prisma.officeRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: SEARCH_HEALTH_RUNS,
      select: {
        agent: true,
        niche: true,
        city: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        found: true,
        created: true,
      },
    });
    // Очередь — только числа компаний: сколько ждут первого сообщения и по каким каналам.
    const waiting = { status: 'READY', optOutAt: null };
    const [ready, withEmail, withWhatsapp, withMobile] = await Promise.all([
      prisma.prospect.count({ where: waiting }),
      prisma.prospect.count({ where: { ...waiting, email: { not: null } } }),
      prisma.prospect.count({ where: { ...waiting, whatsapp: { startsWith: '+79' } } }),
      prisma.prospect.count({ where: { ...waiting, phone: { startsWith: '+79' } } }),
    ]);
    return { ...searchHealth(runs), queue: { ready, withEmail, withWhatsapp, withMobile } };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: 'ok',
      integrations: integrationFlags(),
      office: await officeHealth(),
    });
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
