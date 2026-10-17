// Акция «Пригласи друга» (owner, 2026-10-17): a friend signs up with the
// user's code (lib/referral.ts) — and for 7 days the user's company hears of
// new orders nearby 5 minutes before the other providers. Only the
// notification comes earlier: the order board shows every order to everyone
// at once. Pure functions, safe for client components; the database side is
// lib/referralStore.ts (granting) and lib/deferredOrderNotices.ts (sending).
const DAY_MS = 86_400_000;
/** One friend signed up: this many days of priority. */
export const PRIORITY_DAYS = 7;
/** Priority never reaches further than this many days ahead. */
export const PRIORITY_CAP_DAYS = 30;
/** How much earlier the providers with the bonus hear of a new order. */
export const EARLY_NOTICE_MINUTES = 5;
export const EARLY_NOTICE_MS = EARLY_NOTICE_MINUTES * 60_000;

/**
 * The inviter's new «priority until» after one more friend signed up:
 * max(now, current) + 7 days, at most now + 30 days, never shorter than the
 * current one.
 */
export function extendPriority(current: Date | null | undefined, now: Date): Date {
  const from = Math.max(now.getTime(), current?.getTime() ?? 0);
  const capped = Math.min(
    from + PRIORITY_DAYS * DAY_MS,
    now.getTime() + PRIORITY_CAP_DAYS * DAY_MS,
  );
  return new Date(Math.max(capped, current?.getTime() ?? 0));
}

export function hasPriority(until: Date | string | null | undefined, now: Date): boolean {
  if (!until) return false;
  const time = new Date(until).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

/** A provider company has the bonus when any of its managers has it. */
export function companyHasPriority(
  managers: readonly { priorityUntil?: Date | null }[],
  now: Date,
): boolean {
  return managers.some((user) => hasPriority(user.priorityUntil, now));
}

export interface OrderRecipient {
  userId: string;
  priority: boolean;
}

/**
 * Who hears of a new order now and who 5 minutes later. The delay exists only
 * when someone holds the bonus AND someone else does not: without a
 * competitor with the bonus everyone hears at once, as before the promotion.
 */
export function planOrderNotice(recipients: readonly OrderRecipient[]): {
  now: string[];
  later: string[];
} {
  const early = recipients.filter((item) => item.priority).map((item) => item.userId);
  const others = recipients.filter((item) => !item.priority).map((item) => item.userId);
  if (early.length === 0 || others.length === 0) {
    return { now: [...early, ...others], later: [] };
  }
  return { now: early, later: others };
}

/** «24 октября» — the Moscow day the bonus ends on. */
export function priorityDate(until: Date | string): string {
  return new Date(until).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
}

/** The badge in the provider's cabinet; null when the bonus is not active. */
export function priorityBadgeText(
  until: Date | string | null | undefined,
  now: Date,
): string | null {
  if (!until || !hasPriority(until, now)) return null;
  return `🚀 Заявки приходят вам на ${EARLY_NOTICE_MINUTES} минут раньше — до ${priorityDate(until)}`;
}

/** The invitation block (web and app). */
export const INVITE_HEADLINE = `Пригласите друга — неделю получаете заявки на ${EARLY_NOTICE_MINUTES} минут раньше всех`;
export const INVITE_DETAIL = `Друг регистрируется по вашей ссылке — и ${PRIORITY_DAYS} дней уведомления о новых заявках рядом приходят вам на ${EARLY_NOTICE_MINUTES} минут раньше остальных исполнителей. За каждого следующего — ещё неделя (до ${PRIORITY_CAP_DAYS} дней вперёд).`;

/** For a customer: the bonus works once he connects his own machinery. */
export const CUSTOMER_INVITE_NOTE = `Работаете и сами на технике? За каждого приглашённого — неделя заявок на ${EARLY_NOTICE_MINUTES} минут раньше других исполнителей, когда подключите свою технику.`;

/** The line added to a new-order alert sent early. */
export const EARLY_NOTICE_LINE = `🚀 Вы получили заявку на ${EARLY_NOTICE_MINUTES} минут раньше других — бонус за приглашённого друга`;
