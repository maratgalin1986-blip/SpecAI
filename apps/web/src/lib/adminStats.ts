import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { newsletterAdminCounts } from './newsletterData';
import { todayStartMsk } from './providerFeed';

/**
 * Who signed up, for the owner's counters (site /admin and the app's admin
 * menu). Technical accounts of guest and chat orders (e-mail on «.invalid»)
 * are not people and do not count.
 *
 * «Исполнители» are provider companies, counted from the day the company
 * appeared (at sign-up or by «Стать исполнителем»); СпецПласт16's own fleet is
 * not counted. «Заказчики» are accounts that only order: a customer who became
 * a provider moves to «Исполнители» (and still orders under the same login).
 */
export interface SignupCounts {
  total: number;
  today: number;
  week: number;
  month: number;
}

export interface AdminStats {
  customers: SignupCounts;
  providers: SignupCounts;
  /** Machinists added by provider companies. */
  operators: number;
  /** Same as providers.total, kept for the app's admin menu. */
  providerCompanies: number;
  machines: number;
  openOrders: number;
  activeBookings: number;
  /** Orders imported from chats, waiting for the owner (PENDING_REVIEW). */
  chatOrders: number;
  moderation: { reviews: number; comments: number };
  /** New messages in «Предложения и партнёрство». */
  proposals: number;
  /** «Заявки рядом за неделю»: subscribers now, letters sent in 7 days. */
  newsletter: { subscribers: number; sentWeek: number };
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REAL_EMAIL = { email: { not: { endsWith: '.invalid' } } };

/** The «since» bounds of the counters: today (Moscow), 7 and 30 days. */
export function signupWindows(now: Date) {
  return {
    today: todayStartMsk(now),
    week: new Date(now.getTime() - 7 * DAY_MS),
    month: new Date(now.getTime() - 30 * DAY_MS),
  };
}

async function countSince(
  count: (since?: Date) => Promise<number>,
  now: Date,
): Promise<SignupCounts> {
  const windows = signupWindows(now);
  const [total, today, week, month] = await Promise.all([
    count(),
    count(windows.today),
    count(windows.week),
    count(windows.month),
  ]);
  return { total, today, week, month };
}

export async function loadAdminStats(now: Date = new Date()): Promise<AdminStats> {
  const since = (date?: Date) => (date ? { createdAt: { gte: date } } : {});
  const [
    customers,
    providers,
    operators,
    machines,
    openOrders,
    activeBookings,
    chatOrders,
    reviews,
    comments,
    proposals,
    newsletter,
  ] = await Promise.all([
    countSince(
      (date) => prisma.user.count({ where: { role: 'CUSTOMER', ...REAL_EMAIL, ...since(date) } }),
      now,
    ),
    countSince(
      (date) =>
        prisma.company.count({
          where: { isProvider: true, id: { not: HOUSE_COMPANY_ID }, ...since(date) },
        }),
      now,
    ),
    prisma.user.count({ where: { role: 'PROVIDER_OPERATOR', ...REAL_EMAIL } }),
    prisma.equipment.count({ where: { status: { not: 'RETIRED' } } }),
    prisma.order.count({ where: { status: 'OPEN' } }),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    prisma.order.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.review.count({ where: { textStatus: 'PENDING' } }),
    prisma.comment.count({ where: { status: 'PENDING' } }),
    // A counter must not take the whole summary down (e.g. before `db push`).
    prisma.proposal.count({ where: { status: 'NEW' } }).catch(() => 0),
    newsletterAdminCounts(now).catch(() => ({ subscribers: 0, sentWeek: 0 })),
  ]);
  return {
    customers,
    providers,
    operators,
    providerCompanies: providers.total,
    machines,
    openOrders,
    activeBookings,
    chatOrders,
    moderation: { reviews, comments },
    proposals,
    newsletter,
    generatedAt: now.toISOString(),
  };
}
