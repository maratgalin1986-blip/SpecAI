// Проход по очереди: адреса фирм, которым ещё не писали, проверяются (mailCheck.ts) пачками, нерабочие
// снимаются — у строки адрес очищается, причина пишется в заметку об ошибке. Закладка
// («время создания|id») в настройке: каждый проход берёт следующую пачку; новые фирмы поиск
// добавляет в конец, до них очередь доходит сама. Итог — в настройку для /api/health.
import { prisma } from '@specai/database';
import { addressProblem, type DnsLike } from './mailCheck';

export const SWEEP_CURSOR_KEY = 'office.mailSweepCursor';
export const SWEEP_STATS_KEY = 'office.mailSweep';
/** Сколько строк просматривается за проход и сколько доменов спрашивается одновременно. */
export const SWEEP_BATCH = 120;
const CONCURRENCY = 25;

export interface SweepRow {
  id: string;
  email: string | null;
  createdAt: Date;
}

export interface SweepDb {
  appSetting: {
    findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
  prospect: {
    findMany(args: Record<string, unknown>): Promise<SweepRow[]>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
}

export interface SweepResult {
  checked: number;
  removed: number;
  /** Причины снятых адресов: «у домена нет почтового сервера»: 12 … */
  reasons: Record<string, number>;
}

export interface SweepDeps {
  db?: SweepDb;
  resolver?: DnsLike;
  /** Сколько миллисекунд есть у прохода. */
  budgetMs?: number;
  clock?: () => number;
}

function parseCursor(value: string | undefined): { at: Date; id: string } {
  const [iso, id] = (value ?? '').split('|');
  const at = new Date(iso ?? '');
  return Number.isNaN(at.getTime()) ? { at: new Date(0), id: '' } : { at, id: id ?? '' };
}

async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  }
  return out;
}

/** Один проход проверки адресов. Не бросает: ошибка базы или DNS — пустой итог. */
export async function sweepAddresses(now: Date, deps: SweepDeps = {}): Promise<SweepResult> {
  const db: SweepDb = deps.db ?? (prisma as unknown as SweepDb);
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const budgetMs = deps.budgetMs ?? 9_000;
  const result: SweepResult = { checked: 0, removed: 0, reasons: {} };
  try {
    const settings = await db.appSetting.findMany({
      where: { key: { in: [SWEEP_CURSOR_KEY, SWEEP_STATS_KEY] } },
    });
    const cursor = parseCursor(settings.find((s) => s.key === SWEEP_CURSOR_KEY)?.value);
    const rows = await db.prospect.findMany({
      where: {
        status: 'READY',
        email: { not: null },
        OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.id } }],
      },
      select: { id: true, email: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SWEEP_BATCH,
    });
    if (rows.length === 0) return result;
    let last = rows[0]!;
    // Пачками: на длинной очереди проход укладывается во время, а закладка — на последней
    // полностью проверенной строке.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      if (clock() - startedAt > budgetMs) break;
      const chunk = rows.slice(i, i + CONCURRENCY);
      const problems = await inBatches(chunk, CONCURRENCY, (row) =>
        row.email ? addressProblem(row.email, now, deps.resolver) : Promise.resolve(null),
      );
      for (const [index, row] of chunk.entries()) {
        result.checked += 1;
        last = row;
        const problem = problems[index];
        if (!problem || !row.email) continue;
        const { count } = await db.prospect.updateMany({
          where: { id: row.id, status: 'READY', email: row.email },
          data: {
            email: null,
            outreachError: `Адрес из карточки не годится: ${problem} (${row.email})`,
          },
        });
        if (count > 0) {
          result.removed += 1;
          result.reasons[problem] = (result.reasons[problem] ?? 0) + 1;
        }
      }
    }
    if (result.checked > 0) {
      const previous = (() => {
        try {
          return JSON.parse(settings.find((s) => s.key === SWEEP_STATS_KEY)?.value ?? '{}') as {
            checked?: number;
            removed?: number;
            reasons?: Record<string, number>;
          };
        } catch {
          return {};
        }
      })();
      const reasons: Record<string, number> = { ...(previous.reasons ?? {}) };
      for (const [reason, n] of Object.entries(result.reasons))
        reasons[reason] = (reasons[reason] ?? 0) + n;
      const stats = JSON.stringify({
        at: now.toISOString(),
        checked: (previous.checked ?? 0) + result.checked,
        removed: (previous.removed ?? 0) + result.removed,
        reasons,
      });
      const cursorValue = `${last.createdAt.toISOString()}|${last.id}`;
      await Promise.all([
        db.appSetting.upsert({
          where: { key: SWEEP_STATS_KEY },
          create: { key: SWEEP_STATS_KEY, value: stats },
          update: { value: stats },
        }),
        db.appSetting.upsert({
          where: { key: SWEEP_CURSOR_KEY },
          create: { key: SWEEP_CURSOR_KEY, value: cursorValue },
          update: { value: cursorValue },
        }),
      ]);
    }
  } catch (error) {
    console.error('[office] address sweep failed', error);
  }
  return result;
}
