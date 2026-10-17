import { HOUSE_COMPANY_ID, prisma } from '@specai/database';

/**
 * Who signed up, for the owner's counters (site /admin and the app's admin
 * menu). Technical accounts of guest and chat orders (e-mail on «.invalid»)
 * are not people and do not count.
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
  /** Provider companies (СпецПласт16's own fleet not counted). */
  providerCompanies: number;
  machines: number;
  openOrders: number;
  activeBookings: number;
  moderation: { reviews: number; comments: number };
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REAL_EMAIL = { email: { not: { endsWith: '.invalid' } } };

/** Start of today in Moscow, as an instant. */
export function moscowDayStart(now: Date): Date {
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - 3 * 60 * 60 * 1000,
  );
}

/** The «since» bounds of the counters: today (Moscow), 7 and 30 days. */
export function signupWindows(now: Date) {
  return {
    today: moscowDayStart(now),
    week: new Date(now.getTime() - 7 * DAY_MS),
    month: new Date(now.getTime() - 30 * DAY_MS),
  };
}

async function countSignups(role: 'CUSTOMER' | 'PROVIDER_ADMIN', now: Date): Promise<SignupCounts> {
  const windows = signupWindows(now);
  const where = { role, ...REAL_EMAIL };
  const [total, today, week, month] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, createdAt: { gte: windows.today } } }),
    prisma.user.count({ where: { ...where, createdAt: { gte: windows.week } } }),
    prisma.user.count({ where: { ...where, createdAt: { gte: windows.month } } }),
  ]);
  return { total, today, week, month };
}

export async function loadAdminStats(now: Date = new Date()): Promise<AdminStats> {
  const [
    customers,
    providers,
    operators,
    providerCompanies,
    machines,
    openOrders,
    activeBookings,
    reviews,
    comments,
  ] = await Promise.all([
    countSignups('CUSTOMER', now),
    countSignups('PROVIDER_ADMIN', now),
    prisma.user.count({ where: { role: 'PROVIDER_OPERATOR', ...REAL_EMAIL } }),
    prisma.company.count({ where: { isProvider: true, id: { not: HOUSE_COMPANY_ID } } }),
    prisma.equipment.count({ where: { status: { not: 'RETIRED' } } }),
    prisma.order.count({ where: { status: 'OPEN' } }),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ACTIVE'] } } }),
    prisma.review.count({ where: { textStatus: 'PENDING' } }),
    prisma.comment.count({ where: { status: 'PENDING' } }),
  ]);
  return {
    customers,
    providers,
    operators,
    providerCompanies,
    machines,
    openOrders,
    activeBookings,
    moderation: { reviews, comments },
    generatedAt: now.toISOString(),
  };
}
