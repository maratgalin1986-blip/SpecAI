// «Актуализация»: the database side of lib/aktualno.ts — the weekly question
// from the weekly cron (time-budgeted, once a week per user), the quick page's
// machines and their save (only the user's own company, never the house fleet),
// the switch in «Уведомления» and the owner's counter in /admin.
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import {
  availableFromChoice,
  canAnswerPriceAsk,
  choiceFromStored,
  priceAskDue,
  priceAskUsersWhere,
  PRICE_ASK_INTERVAL_MS,
  type AktualnoItem,
  type AvailabilityChoice,
} from './aktualno';
import { notifyUser } from './notifications/notifyUser';
import type { DeliveryReport } from './notifications/deliver';

/** Where the last run stopped (AppSetting): the next one goes on from there. */
export const PRICE_ASK_CURSOR = 'price-ask.cursor';
/** Users read at a time (by id, so a run never sees one twice). */
export const PRICE_ASK_PAGE = 100;
/** Messages per run at most (Telegram allows ~30 a second; push is batched by Expo). */
export const PRICE_ASK_MAX_PER_RUN = 300;
/** Sent at once: each one is a few HTTP calls (Telegram, Expo, Resend). */
const PRICE_ASK_BATCH = 10;
/** A message not delivered by then counts as failed: the cron must end within maxDuration. */
export const PRICE_ASK_SEND_TIMEOUT_MS = 8_000;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export interface PriceAskResult {
  sent: number;
  skipped: number;
  failed: number;
  stopped?: 'deadline' | 'limit';
}

export interface PriceAskOptions {
  now?: Date;
  /** Epoch ms after which no new message starts. */
  deadline?: number;
  notify?: (userId: string) => Promise<DeliveryReport>;
  /** Messages per run (PRICE_ASK_MAX_PER_RUN; smaller in tests). */
  maxPerRun?: number;
}

/**
 * Claims this week's message for the user: the settings row's priceAskSentAt
 * moves to `now` only if the user did not switch the message off and was not
 * asked within PRICE_ASK_INTERVAL_MS. A user without a row gets one (the
 * defaults, as prefsFrom reads them); a second run creating it at the same
 * time loses on the unique userId. A repeated cron call therefore never sends
 * a second message in the same week.
 */
export async function claimPriceAsk(userId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - PRICE_ASK_INTERVAL_MS);
  const updated = await prisma.notificationSettings.updateMany({
    where: {
      userId,
      priceAsk: true,
      OR: [{ priceAskSentAt: null }, { priceAskSentAt: { lte: cutoff } }],
    },
    data: { priceAskSentAt: now },
  });
  if (updated.count === 1) return true;
  const exists = await prisma.notificationSettings.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (exists) return false;
  return prisma.notificationSettings
    .create({ data: { userId, priceAskSentAt: now } })
    .then(() => true)
    .catch(() => false);
}

/** Gives the week back when nothing could be delivered because of errors. */
async function releasePriceAsk(userId: string, now: Date, previous: Date | null) {
  await prisma.notificationSettings
    .updateMany({ where: { userId, priceAskSentAt: now }, data: { priceAskSentAt: previous } })
    .catch((error: unknown) => console.error('[price-ask] could not release', error));
}

/**
 * The weekly «обновите цены и свободные дни» from api/cron/weekly, after its
 * other work. Provider managers of companies with machinery (never the house
 * fleet, machinists or customers), who did not switch it off, once a week.
 * Stops starting new messages at `deadline` and after PRICE_ASK_MAX_PER_RUN;
 * the next call goes on with those not asked yet.
 */
export async function sendWeeklyPriceAsk(options: PriceAskOptions = {}): Promise<PriceAskResult> {
  const now = options.now ?? new Date();
  const deadline = options.deadline ?? now.getTime() + 15_000;
  const notify = options.notify ?? ((userId: string) => notifyUser(userId, { type: 'price.ask' }));
  const result: PriceAskResult = { sent: 0, skipped: 0, failed: 0 };
  // A run that stopped (limit, deadline) goes on next time after the last
  // user it reached, then wraps around: everybody is asked in turn, not the
  // same first PRICE_ASK_MAX_PER_RUN every Monday.
  const saved = await prisma.appSetting
    .findUnique({ where: { key: PRICE_ASK_CURSOR } })
    .catch(() => null);
  const startAfter = saved?.value || undefined;
  let pass: 'tail' | 'head' = startAfter ? 'tail' : 'head';
  let cursor = startAfter;
  let reached: string | undefined = startAfter;
  // Where the cursor stood before the first failed send: a stopped run goes
  // on from there, so the providers whose message failed are tried again
  // next time, not a whole round later.
  let held: { at: string | undefined } | null = null;
  const stop = async (stopped: PriceAskResult['stopped']) => {
    const at = held ? held.at : reached;
    if (at) {
      await prisma.appSetting
        .upsert({
          where: { key: PRICE_ASK_CURSOR },
          update: { value: at },
          create: { key: PRICE_ASK_CURSOR, value: at },
        })
        .catch((error: unknown) => console.error('[price-ask] cursor not saved', error));
    }
    return { ...result, stopped };
  };

  for (;;) {
    if (Date.now() >= deadline) return stop('deadline');
    const idWhere =
      pass === 'tail'
        ? { gt: cursor }
        : { ...(cursor ? { gt: cursor } : {}), ...(startAfter ? { lte: startAfter } : {}) };
    const users = await prisma.user.findMany({
      where: { ...priceAskUsersWhere(), ...(Object.keys(idWhere).length ? { id: idWhere } : {}) },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PRICE_ASK_PAGE,
    });
    const settings = users.length
      ? await prisma.notificationSettings.findMany({
          where: { userId: { in: users.map((user) => user.id) } },
          select: { userId: true, priceAsk: true, priceAskSentAt: true },
          take: users.length,
        })
      : [];
    const byUser = new Map(settings.map((row) => [row.userId, row]));
    const due = users.filter((user) => priceAskDue(byUser.get(user.id), now));
    result.skipped += users.length - due.length;

    const maxPerRun = options.maxPerRun ?? PRICE_ASK_MAX_PER_RUN;
    for (let i = 0; i < due.length;) {
      if (Date.now() >= deadline) return stop('deadline');
      if (result.sent >= maxPerRun) return stop('limit');
      const batch = due.slice(i, i + Math.min(PRICE_ASK_BATCH, maxPerRun - result.sent));
      i += batch.length;
      const outcomes = await Promise.all(
        batch.map(async (user) => {
          try {
            if (!(await claimPriceAsk(user.id, now))) return 'skipped' as const;
            const report = await withTimeout(notify(user.id), PRICE_ASK_SEND_TIMEOUT_MS);
            // No answer in time: it may still arrive, so the week stays claimed.
            if (report === 'timeout') return 'failed' as const;
            const results = Object.values(report);
            if (results.some((item) => item?.ok)) return 'sent' as const;
            // Nothing reachable (no Telegram, no app, no e-mail set up): the
            // week stays claimed, there is nothing to retry.
            if (results.length === 0) return 'skipped' as const;
            await releasePriceAsk(user.id, now, byUser.get(user.id)?.priceAskSentAt ?? null);
            return 'failed' as const;
          } catch (error) {
            console.error('[price-ask] failed for one provider', error);
            return 'failed' as const;
          }
        }),
      );
      for (const outcome of outcomes) result[outcome] += 1;
      if (!held && outcomes.includes('failed')) held = { at: reached };
      reached = batch[batch.length - 1]!.id;
    }
    if (users.length > 0) {
      cursor = users[users.length - 1]!.id;
      reached = cursor;
    }
    if (users.length < PRICE_ASK_PAGE) {
      if (pass === 'tail') {
        pass = 'head';
        cursor = undefined;
        continue;
      }
      // Everybody reached: the next run starts from the beginning.
      await prisma.appSetting
        .deleteMany({ where: { key: PRICE_ASK_CURSOR } })
        .catch(() => undefined);
      return result;
    }
  }
}

// ---------------------------------------------------------------------------
// The quick page
// ---------------------------------------------------------------------------

export interface AktualnoMachine {
  id: string;
  name: string;
  categoryName: string;
  status: string;
  hourlyRate: number | null;
  dailyRate: number;
  availability: AvailabilityChoice | null;
  availabilityUpdatedAt: string | null;
}

/** The company's machines on the site, newest first (taken-off ones are not asked about). */
export async function loadAktualno(companyId: string, now: Date = new Date()) {
  const rows = await prisma.equipment.findMany({
    where: { companyId, status: { not: 'RETIRED' } },
    select: {
      id: true,
      name: true,
      status: true,
      hourlyRate: true,
      dailyRate: true,
      availableFrom: true,
      availabilityUpdatedAt: true,
      category: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((row): AktualnoMachine => ({
    id: row.id,
    name: row.name,
    categoryName: row.category.name,
    status: row.status,
    hourlyRate: row.hourlyRate === null ? null : Math.round(Number(row.hourlyRate)),
    dailyRate: Math.round(Number(row.dailyRate)),
    availability: choiceFromStored(row.availableFrom, now),
    availabilityUpdatedAt: row.availabilityUpdatedAt?.toISOString() ?? null,
  }));
}

export type SaveResult = { ok: true; saved: number } | { ok: false; status: number; error: string };

export const HOUSE_NOT_ASKED =
  'Цены и занятость парка СпецПласт16 задаёт владелец в карточках машин — опрос только для других исполнителей';

/**
 * «Сохранить»: prices and the free day of each machine, and the moment of the
 * answer. Every id must be a machine of the user's own company on the site;
 * one foreign or missing id refuses the whole save (it looks the same as a
 * missing machine). The house fleet is never changed here. One transaction:
 * either all machines are saved or none.
 */
export async function saveAktualno(
  user: { role?: string | null; companyId?: string | null },
  items: readonly AktualnoItem[],
  now: Date = new Date(),
): Promise<SaveResult> {
  if (user.role === 'PROVIDER_ADMIN' && user.companyId === HOUSE_COMPANY_ID) {
    return { ok: false, status: 403, error: HOUSE_NOT_ASKED };
  }
  if (!canAnswerPriceAsk(user)) {
    return {
      ok: false,
      status: 403,
      error: 'Обновлять цены может руководитель компании-исполнителя',
    };
  }
  const companyId = user.companyId;
  const days: Date[] = [];
  for (const item of items) {
    const day = availableFromChoice(item.availability, now);
    if (!day.ok) return { ok: false, status: 400, error: day.error };
    days.push(day.day);
  }
  const ids = items.map((item) => item.id);
  const own = await prisma.equipment.findMany({
    where: { id: { in: ids }, companyId, status: { not: 'RETIRED' } },
    select: { id: true },
    take: ids.length,
  });
  if (own.length !== new Set(ids).size) {
    return { ok: false, status: 404, error: 'Техника не найдена' };
  }
  await prisma.$transaction(
    items.map((item, index) =>
      prisma.equipment.updateMany({
        // The owner again in the update itself: a machine moved to another
        // company in between is not touched.
        where: { id: item.id, companyId, NOT: { companyId: HOUSE_COMPANY_ID } },
        data: {
          hourlyRate: item.hourlyRate,
          dailyRate: item.dailyRate,
          availableFrom: days[index],
          availabilityUpdatedAt: now,
        },
      }),
    ),
  );
  return { ok: true, saved: items.length };
}

// ---------------------------------------------------------------------------
// The switch and the owner's counter
// ---------------------------------------------------------------------------

/** The weekly message is on unless the user switched it off. */
export async function priceAskEnabled(userId: string): Promise<boolean> {
  const row = await prisma.notificationSettings.findUnique({
    where: { userId },
    select: { priceAsk: true },
  });
  return row?.priceAsk ?? true;
}

export async function setPriceAsk(userId: string, enabled: boolean): Promise<void> {
  await prisma.notificationSettings.upsert({
    where: { userId },
    update: { priceAsk: enabled },
    create: { userId, priceAsk: enabled },
  });
}

/** /admin: provider companies that confirmed prices and free days in the last 7 days. */
export async function aktualnoAdminCount(now: Date = new Date()): Promise<number> {
  const rows = await prisma.equipment.groupBy({
    by: ['companyId'],
    where: {
      availabilityUpdatedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      companyId: { not: HOUSE_COMPANY_ID },
    },
    orderBy: { companyId: 'asc' },
    take: 5000,
  });
  return rows.length;
}
