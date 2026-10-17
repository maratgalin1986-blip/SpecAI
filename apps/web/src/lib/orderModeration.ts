// The AI moderator of chat orders (owner, 2026-10-17: «Заявки я не буду сам
// администрировать — подключи обученный ИИ, который всё это будет делать за
// меня»). An order the importer was not sure about (PENDING_REVIEW, see
// lib/ingest.ts) goes to the moderator right away; whatever is left (the AI
// was unsure, failed or ran out of the daily budget) is retried by the daily
// cron (sweepPendingOrders). A verdict:
//   PUBLISH → OPEN, providers are told as for a confident import;
//   REJECT  → CANCELLED, nobody is told;
//   UNSURE  → stays PENDING_REVIEW and is asked again; a day after the import
//             it is rejected («не удалось понять заявку») — the owner does not
//             moderate, so nothing waits for him.
// Without ANTHROPIC_API_KEY the same verdicts come from rules (rulesVerdict:
// the importer's parser — a request with a machinery type is published,
// an advert or chatter rejected, anything else waits a day and is rejected),
// so nothing waits for the owner either way (owner, 2026-10-17).
// The admin can still override any decision from /admin («Решения ИИ»).
import { prisma } from '@specai/database';
import {
  ModerationOutputError,
  moderateChatOrder,
  type ChatOrderModeration,
  type ModerationDecision,
} from '@specai/ai-service';
import { adminCanMoveOrder } from '@/lib/adminOrders';
import { bidsUntilFor } from '@/lib/bidWindow';
import { moscowDateKey } from '@/lib/bookingRules';
import { notifyProvidersAboutOrder } from '@/lib/notifications/notifyUser';
import { todayStartMsk } from '@/lib/providerFeed';
import { parseEquipmentRequest } from '@specai/shared';

export const AI_MODERATOR = 'ai';
/** Decisions made by rules while no AI key is set (rulesVerdict). */
export const RULES_MODERATOR = 'rules';
export const ADMIN_MODERATOR = 'admin';

/** An order the AI stays unsure about is rejected this long after the import. */
export const UNSURE_GIVE_UP_MS = 24 * 3_600_000;
export const GIVE_UP_REASON = 'не удалось понять заявку';
export const NO_TEXT_REASON = 'нет текста заявки';
export const NO_CATEGORY_REASON = 'не понятно, какая техника нужна';
export const PAST_DATES_REASON = 'сроки заявки уже прошли';

/** At most this many orders per sweep (one cron run). */
export const SWEEP_LIMIT = 20;
/** At most this many moderator calls a day (Moscow), all paths together. */
export const DAILY_AI_BUDGET = 300;
/** The sweep stops after this many failed calls in a row (the API is down). */
export const SWEEP_MAX_ERRORS = 3;
const SWEEP_CONCURRENCY = 4;
/** One sweep call may take this long (no retries)… */
const SWEEP_CALL_TIMEOUT_MS = 15_000;
/** …and none starts after this, so the sweep ends within ~40 s of the cron's 60. */
const SWEEP_TIME_BUDGET_MS = 20_000;
/** The same minimum as the importer's (lib/ingest.ts). */
const MIN_TEXT = 12;

/** Same check as the AI client (packages/ai-service/src/client.ts). */
export function aiModerationEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * An order the AI rejected may be published by the admin from «Решения ИИ»
 * (CANCELLED → OPEN). Only that one, and only with a machinery type and dates
 * still ahead: an erased order (rawText is wiped, see ERASED_ORDER_DATA) or
 * one the admin closed himself stays closed. The Prisma filter for the admin
 * PATCH and the check for the button are the same rule.
 */
export function aiRejectedRepublishableWhere(now: Date = new Date()) {
  return {
    status: 'CANCELLED' as const,
    moderatedBy: AI_MODERATOR,
    moderationDecision: 'REJECT',
    rawText: { not: null },
    categoryId: { not: null },
    desiredEndDate: { gte: todayStartMsk(now) },
  };
}

export function aiRejectedRepublishable(
  order: {
    status: string;
    moderatedBy: string | null;
    moderationDecision: string | null;
    rawText: string | null;
    categoryId: string | null;
    desiredEndDate: Date;
  },
  now: Date = new Date(),
): boolean {
  return (
    order.status === 'CANCELLED' &&
    order.moderatedBy === AI_MODERATOR &&
    order.moderationDecision === 'REJECT' &&
    order.rawText !== null &&
    order.categoryId !== null &&
    order.desiredEndDate.getTime() >= todayStartMsk(now).getTime()
  );
}

export function budgetKey(now: Date): string {
  return `ai.moderation.calls:${moscowDateKey(now)}`;
}

/**
 * Takes one moderator call from today's budget; false when it is used up.
 * The counter is a row of AppSetting per Moscow day, raised in one statement
 * so that parallel imports cannot overrun it.
 */
export async function claimModerationCall(now: Date = new Date()): Promise<boolean> {
  const key = budgetKey(now);
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES (${key}, '1', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = (CAST("AppSetting"."value" AS INTEGER) + 1)::text, "updatedAt" = NOW()
      WHERE CAST("AppSetting"."value" AS INTEGER) < ${DAILY_AI_BUDGET}
    RETURNING "value"`;
  return rows.length > 0;
}

export type ModerationOutcome =
  | { status: 'published' | 'rejected' | 'unsure'; reason: string }
  | { status: 'skipped'; reason: 'no-ai' | 'not-pending' | 'budget' };

const ORDER_SELECT = {
  id: true,
  status: true,
  rawText: true,
  description: true,
  sourceChat: true,
  categoryId: true,
  createdAt: true,
  desiredStartDate: true,
  desiredEndDate: true,
  moderationDecision: true,
  category: { select: { slug: true } },
  location: { select: { city: true } },
} as const;

/** Saves a verdict while the order is still waiting; false when it no longer is. */
async function decide(
  orderId: string,
  decision: ModerationDecision,
  reason: string,
  now: Date,
  extra: { status?: 'OPEN' | 'CANCELLED'; categoryId?: string; bidsUntil?: Date } = {},
  moderator: string = AI_MODERATOR,
): Promise<boolean> {
  const { count } = await prisma.order.updateMany({
    // The admin may have decided in the meantime: his decision stays.
    where: { id: orderId, status: 'PENDING_REVIEW' },
    data: {
      ...extra,
      moderatedBy: moderator,
      moderationDecision: decision,
      moderationReason: reason.slice(0, 160),
      moderatedAt: now,
    },
  });
  return count > 0;
}

/**
 * The verdict without the AI: the importer's own parser. An order waits here
 * because the parser saw a request but was not sure enough to publish it at
 * once; with a machinery type it is published (providers are matched by it),
 * an advert or chatter is rejected, and anything else stays unsure.
 */
export function rulesVerdict(
  text: string,
  now: Date = new Date(),
  /** The machinery type the import already found, if any. */
  knownCategory?: string | null,
): ChatOrderModeration {
  const parsed = parseEquipmentRequest(text, now);
  // An advert («сдаю», «услуги», прайс) is never an order; without a known
  // machinery type the parser must also see a request in the text.
  const advert = parsed.signals.some((signal) => signal.startsWith('признаки рекламы'));
  if (advert || (!parsed.isRequest && !knownCategory)) {
    return { decision: 'REJECT', reason: 'похоже на объявление или разговор, а не на заявку' };
  }
  const category = knownCategory ?? parsed.categorySlug;
  if (!category) return { decision: 'UNSURE', reason: NO_CATEGORY_REASON };
  return {
    decision: 'PUBLISH',
    reason: 'заявка на технику (проверено правилами)',
    categoryHint: category,
  };
}

/**
 * Moderates one PENDING_REVIEW order. Throws only when the AI could not be
 * asked (network, rate limit): the order then stays pending for the sweep.
 */
export async function autoModerateOrder(
  orderId: string,
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<ModerationOutcome> {
  const now = options.now ?? new Date();
  const useAi = aiModerationEnabled();
  const moderator = useAi ? AI_MODERATOR : RULES_MODERATOR;
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
  if (!order || order.status !== 'PENDING_REVIEW') {
    return { status: 'skipped', reason: 'not-pending' };
  }
  const reject = async (reason: string, decision: ModerationDecision = 'REJECT') =>
    (await decide(order.id, decision, reason, now, { status: 'CANCELLED' }, moderator))
      ? ({ status: 'rejected', reason } as const)
      : ({ status: 'skipped', reason: 'not-pending' } as const);

  // Nothing to ask the AI about, or nothing left to do on it.
  const text = (order.rawText ?? order.description ?? '').trim();
  if (text.length < MIN_TEXT) return reject(NO_TEXT_REASON);
  if (order.desiredEndDate.getTime() < todayStartMsk(now).getTime()) {
    return reject(PAST_DATES_REASON);
  }
  // Already unsure once and a day has passed: no need to pay for another try.
  const overdue = now.getTime() - order.createdAt.getTime() >= UNSURE_GIVE_UP_MS;
  if (overdue && order.moderationDecision === 'UNSURE') return reject(GIVE_UP_REASON);

  let verdict: ChatOrderModeration;
  if (!useAi) {
    verdict = rulesVerdict(text, now, order.category?.slug);
  } else {
    if (!(await claimModerationCall(now))) return { status: 'skipped', reason: 'budget' };
    try {
      verdict = await moderateChatOrder(
        {
          text,
          chatTitle: order.sourceChat,
          categorySlug: order.category?.slug,
          city: order.location?.city,
          today: moscowDateKey(now),
        },
        options.timeoutMs ? { timeoutMs: options.timeoutMs, maxRetries: 0 } : {},
      );
    } catch (error) {
      // An answer that is not a verdict counts as a doubt; anything else
      // (network, rate limit) is the caller's to log and retry.
      if (!(error instanceof ModerationOutputError)) throw error;
      verdict = { decision: 'UNSURE', reason: 'ИИ не дал понятного ответа' };
    }
  }

  if (verdict.decision === 'PUBLISH') {
    // Never on the board without a machinery type: providers are matched by it.
    const hinted =
      !order.categoryId && verdict.categoryHint
        ? await prisma.equipmentCategory.findUnique({
            where: { slug: verdict.categoryHint },
            select: { id: true },
          })
        : null;
    const categoryId = order.categoryId ?? hinted?.id;
    if (!categoryId) return reject(NO_CATEGORY_REASON);
    const published = await decide(
      order.id,
      'PUBLISH',
      verdict.reason,
      now,
      {
        status: 'OPEN',
        ...(order.categoryId ? {} : { categoryId }),
        // Providers get the usual time to bid from the moment it is published.
        bidsUntil: bidsUntilFor(now, order.desiredStartDate),
      },
      moderator,
    );
    if (!published) return { status: 'skipped', reason: 'not-pending' };
    // The same side effect as a confident import (lib/ingest.ts).
    await notifyProvidersAboutOrder(order.id);
    return { status: 'published', reason: verdict.reason };
  }

  if (verdict.decision === 'REJECT') return reject(verdict.reason);

  if (overdue) return reject(GIVE_UP_REASON);
  return (await decide(order.id, 'UNSURE', verdict.reason, now, {}, moderator))
    ? { status: 'unsure', reason: verdict.reason }
    : { status: 'skipped', reason: 'not-pending' };
}

export interface SweepResult {
  enabled: boolean;
  checked: number;
  published: number;
  rejected: number;
  unsure: number;
  skipped: number;
  errors: number;
}

/**
 * Daily pass over the orders still waiting (api/cron/daily): those never
 * tried first, then the longest since the last try, the oldest first; at most
 * `limit` (≤ SWEEP_LIMIT) a run. Stops when the budget is used up, the API
 * keeps failing or the run is close to its time limit.
 */
export async function sweepPendingOrders(
  options: { limit?: number; now?: Date } = {},
): Promise<SweepResult> {
  const result: SweepResult = {
    // Always on: without the AI key the rules decide (rulesVerdict).
    enabled: true,
    checked: 0,
    published: 0,
    rejected: 0,
    unsure: 0,
    skipped: 0,
    errors: 0,
  };
  const now = options.now ?? new Date();
  const limit = Math.max(0, Math.min(options.limit ?? SWEEP_LIMIT, SWEEP_LIMIT));

  // Yesterday's and older budget counters are no longer needed.
  await prisma.appSetting
    .deleteMany({
      where: { key: { startsWith: 'ai.moderation.calls:', not: budgetKey(now) } },
    })
    .catch(() => undefined);

  const orders = await prisma.order.findMany({
    where: { status: 'PENDING_REVIEW' },
    orderBy: [{ moderatedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true },
  });

  const startedAt = Date.now();
  const queue = orders.map((order) => order.id);
  let failuresInRow = 0;
  let stop = false;
  const worker = async () => {
    while (!stop && queue.length > 0) {
      if (Date.now() - startedAt > SWEEP_TIME_BUDGET_MS) return;
      const id = queue.shift() as string;
      result.checked += 1;
      try {
        const outcome = await autoModerateOrder(id, { now, timeoutMs: SWEEP_CALL_TIMEOUT_MS });
        failuresInRow = 0;
        if (outcome.status === 'published') result.published += 1;
        else if (outcome.status === 'rejected') result.rejected += 1;
        else if (outcome.status === 'unsure') result.unsure += 1;
        else {
          result.skipped += 1;
          if (outcome.reason === 'budget') stop = true;
        }
      } catch (error) {
        console.error('[moderation] AI moderation failed', id, error);
        result.errors += 1;
        failuresInRow += 1;
        if (failuresInRow >= SWEEP_MAX_ERRORS) stop = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, queue.length) }, worker));
  return result;
}

/** «Решения ИИ» in /admin and in the app: the latest AI verdicts. */
export const AI_DECISIONS_TAKE = 30;

export async function loadAiDecisions(now: Date = new Date()) {
  const rows = await prisma.order.findMany({
    where: { moderationDecision: { not: null } },
    orderBy: { moderatedAt: 'desc' },
    take: AI_DECISIONS_TAKE,
    select: {
      id: true,
      status: true,
      rawText: true,
      description: true,
      categoryId: true,
      desiredEndDate: true,
      moderatedBy: true,
      moderationDecision: true,
      moderationReason: true,
      moderatedAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    excerpt: (row.rawText ?? row.description).replace(/\s+/g, ' ').trim().slice(0, 200),
    decision: row.moderationDecision as ModerationDecision,
    reason: row.moderationReason ?? '',
    moderatedAt: row.moderatedAt,
    overridden: row.moderatedBy === ADMIN_MODERATOR,
    // What the admin may still do (api/admin/orders/[id]).
    canWithdraw: row.status === 'OPEN',
    canPublish: adminCanMoveOrder(row.status, 'OPEN') || aiRejectedRepublishable(row, now),
  }));
}
export type AiDecisionRow = Awaited<ReturnType<typeof loadAiDecisions>>[number];

/** One line for the owner once a day: what the AI did over the last 24 h. */
export async function aiModerationSummary(now: Date = new Date()): Promise<string | null> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await prisma.order.groupBy({
    by: ['moderationDecision'],
    where: { moderatedBy: { in: [AI_MODERATOR, RULES_MODERATOR] }, moderatedAt: { gte: since } },
    _count: true,
  });
  const count = (decision: ModerationDecision) =>
    rows.find((row) => row.moderationDecision === decision)?._count ?? 0;
  const published = count('PUBLISH');
  const rejected = count('REJECT');
  if (published + rejected === 0) return null;
  const who = aiModerationEnabled() ? 'ИИ' : 'Автомодерация';
  return `🤖 ${who} за сутки: опубликовано заявок — ${published}, отклонено — ${rejected}.`;
}
