// Durable per-phone lead limit. The per-IP limit in lib/rateLimit.ts lives in
// the memory of one serverless instance, so a flood spread over instances (or
// over IPs) passes it. This check counts the leads already saved in the `Lead`
// table for the same normalised phone — no schema change, the table already
// has `phone` and an index on `createdAt`.
//
// When the database cannot be read the check never blocks on its own: it falls
// back to an in-memory counter with the same limits.

import { checkRateLimit } from './rateLimit';

const MINUTE = 60 * 1000;

export const PHONE_LEAD_LIMITS = {
  /** At most 3 leads per phone in 10 minutes: the 4th is refused. */
  burst: { limit: 3, windowMs: 10 * MINUTE },
  /** At most 10 leads per phone per day. */
  daily: { limit: 10, windowMs: 24 * 60 * MINUTE },
} as const;

/** Digits of a Russian number in one form: 8 927 … and +7 927 … → 7927…; 927… → 7927…. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

/** The saved leads since `since` that may belong to the phone (filtered again here). */
export type RecentLeadsLookup = (
  normalizedPhone: string,
  since: Date,
) => Promise<{ phone: string; createdAt: Date }[]>;

export type PhoneLimitResult = { ok: true } | { ok: false; reason: 'burst' | 'daily' };

/** One friendly text for both limits, with the number to call. */
export function phoneLimitMessage(sitePhone: string): string {
  return `Мы уже получили заявки с этого номера и скоро перезвоним. Если срочно — позвоните нам: ${sitePhone}.`;
}

function memoryCheck(normalized: string): PhoneLimitResult {
  // Both windows must be recorded, so check the daily one only after burst passed.
  if (!checkRateLimit(`lead-phone:10m:${normalized}`, PHONE_LEAD_LIMITS.burst).ok) {
    return { ok: false, reason: 'burst' };
  }
  if (!checkRateLimit(`lead-phone:day:${normalized}`, PHONE_LEAD_LIMITS.daily).ok) {
    return { ok: false, reason: 'daily' };
  }
  return { ok: true };
}

export async function checkPhoneLeadLimit(
  phone: string,
  lookup: RecentLeadsLookup,
  now: number = Date.now(),
): Promise<PhoneLimitResult> {
  const normalized = normalizePhone(phone);
  // No phone (a messenger lead without a number): nothing to count by.
  if (normalized.length < 10) return { ok: true };

  let rows: { phone: string; createdAt: Date }[];
  try {
    rows = await lookup(normalized, new Date(now - PHONE_LEAD_LIMITS.daily.windowMs));
  } catch {
    return memoryCheck(normalized);
  }
  const times = rows
    .filter((row) => normalizePhone(row.phone) === normalized)
    .map((row) => new Date(row.createdAt).getTime());
  const burstStart = now - PHONE_LEAD_LIMITS.burst.windowMs;
  if (times.filter((t) => t > burstStart).length >= PHONE_LEAD_LIMITS.burst.limit) {
    return { ok: false, reason: 'burst' };
  }
  if (times.length >= PHONE_LEAD_LIMITS.daily.limit) return { ok: false, reason: 'daily' };
  return { ok: true };
}

/**
 * The Prisma lookup: leads of the last day whose phone ends with the same last
 * two digits (they stay together in every common format: …-00-00, …0000),
 * then normalised and compared exactly in checkPhoneLeadLimit.
 */
export function prismaRecentLeads(prisma: {
  lead: {
    findMany: (args: {
      where: { createdAt: { gte: Date }; phone: { endsWith: string } };
      select: { phone: true; createdAt: true };
      take: number;
    }) => Promise<{ phone: string; createdAt: Date }[]>;
  };
}): RecentLeadsLookup {
  return (normalized, since) =>
    prisma.lead.findMany({
      where: { createdAt: { gte: since }, phone: { endsWith: normalized.slice(-2) } },
      select: { phone: true, createdAt: true },
      take: 500,
    });
}
