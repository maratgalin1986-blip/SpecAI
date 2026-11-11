import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { integrationFlags } from '@/lib/integrationFlags';
import { LAST_OUTREACH_KEY } from '@/lib/office/tick';
import { MAIL_READ_KEY } from '@/lib/office/repliesRun';
import { SEARCH_HEALTH_RUNS, searchHealth, type SearchHealth } from '@/lib/office/searchHealth';

export const dynamic = 'force-dynamic';

// One-request production check: is the database reachable from the server
// functions? Returns the error class and Prisma code only, never secrets.
// `office` says whether the agents' search for companies works (lib/office/searchHealth.ts):
// a word, a time and the run's counts — no names, phones or ids. A cloud session without the
// admin password reads it to see that the search really runs in production.
/** Начало текущих суток по Москве (UTC+3, без перехода на летнее время). */
function moscowDayStart(now: Date): Date {
  const shifted = now.getTime() + 3 * 3_600_000;
  return new Date(shifted - (shifted % 86_400_000) - 3 * 3_600_000);
}

/** Запись настройки как объект из чисел и слов состояния; null — записи нет или она не JSON. */
function parseRecord(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface OutreachHealth {
  /** Писем фирмам за сегодня (сутки по Москве) и за всё время. */
  sentToday: number;
  sentTotal: number;
  /** Когда ушло последнее письмо. */
  lastSentAt: string | null;
  /** Сколько фирм сегодня получили отметку об ошибке отправки. */
  errorsToday: number;
  /** Ответов фирм, прочитанных из ящика сегодня. */
  repliesToday: number;
  /** Итог последнего прохода рассылки: время, числа, состояние ящика, код ответа сервера. */
  lastPass: Record<string, unknown> | null;
  /** Итог последнего чтения ответов из ящика: время и числа. */
  mailbox: Record<string, unknown> | null;
}

async function officeHealth(): Promise<
  (SearchHealth & { queue: Record<string, number>; outreach: OutreachHealth }) | null
> {
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
    // Рассылка — тоже только числа и время: по ним сессия без пароля видит, что письма уходят.
    const dayStart = moscowDayStart(new Date());
    const [sentToday, sentTotal, lastSent, errorsToday] = await Promise.all([
      prisma.prospect.count({ where: { emailSentAt: { gte: dayStart } } }),
      prisma.prospect.count({ where: { emailSentAt: { not: null } } }),
      prisma.prospect.findFirst({
        where: { emailSentAt: { not: null } },
        orderBy: { emailSentAt: 'desc' },
        select: { emailSentAt: true },
      }),
      prisma.prospect.count({ where: { outreachErrorAt: { gte: dayStart } } }),
    ]);
    const [repliesToday, records] = await Promise.all([
      prisma.prospect.count({ where: { repliedAt: { gte: dayStart } } }),
      prisma.appSetting.findMany({
        where: { key: { in: [LAST_OUTREACH_KEY, MAIL_READ_KEY] } },
        select: { key: true, value: true },
      }),
    ]);
    const record = (key: string) => parseRecord(records.find((r) => r.key === key)?.value);
    return {
      ...searchHealth(runs, new Date()),
      queue: { ready, withEmail, withWhatsapp, withMobile },
      outreach: {
        sentToday,
        sentTotal,
        lastSentAt: lastSent?.emailSentAt?.toISOString() ?? null,
        errorsToday,
        repliesToday,
        lastPass: record(LAST_OUTREACH_KEY),
        mailbox: record(MAIL_READ_KEY),
      },
    };
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
