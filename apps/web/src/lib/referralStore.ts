import { prisma } from '@specai/database';
import { generateReferralCode, normalizeReferralCode } from './referral';
import { extendPriority } from './referralPriority';

// Database side of «Пригласи коллегу» (lib/referral.ts). The column has no
// unique constraint (see schema.prisma), so a new code is checked here; with
// 31^7 ≈ 2.7·10^10 codes a clash is practically impossible, and a few tries
// cover it anyway.

/** A code nobody has yet. */
export async function freeReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    const taken = await prisma.user.findFirst({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error('[referral] could not find a free code');
}

/** The user's code, created on first use. */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) return null;
  if (user.referralCode) return user.referralCode;
  const code = await freeReferralCode();
  // Only if still empty: two tabs opening the cabinet at once keep one code.
  await prisma.user.updateMany({
    where: { id: userId, referralCode: null },
    data: { referralCode: code },
  });
  const saved = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  return saved?.referralCode ?? code;
}

/** Who owns this code; null for a bad or unknown one. */
export async function findReferrer(value: unknown): Promise<{ id: string; role: string } | null> {
  const code = normalizeReferralCode(value);
  if (!code) return null;
  return prisma.user.findFirst({
    where: { referralCode: code },
    select: { id: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** How many people signed up with the user's link, and how many of them are providers. */
export async function invitedCounts(userId: string): Promise<{ total: number; providers: number }> {
  const [total, providers] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.count({ where: { referredById: userId, role: 'PROVIDER_ADMIN' } }),
  ]);
  return { total, providers };
}

/**
 * Акция «Пригласи друга»: a friend signed up with the inviter's code, so the
 * inviter's priority grows by 7 days (lib/referralPriority.ts extendPriority).
 * Never for the new account itself. The write only lands on the value it was
 * computed from, so two friends signing up at once both count. Returns the
 * new date and the inviter's role, or null when nothing was granted.
 */
export async function grantReferralPriority(
  referrerId: string | null | undefined,
  newUserId: string,
  now: Date = new Date(),
): Promise<{ until: Date; role: string } | null> {
  if (!referrerId || referrerId === newUserId) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { priorityUntil: true, role: true },
    });
    if (!referrer) return null;
    const until = extendPriority(referrer.priorityUntil, now);
    const saved = await prisma.user.updateMany({
      where: { id: referrerId, priorityUntil: referrer.priorityUntil },
      data: { priorityUntil: until },
    });
    if (saved.count === 1) return { until, role: referrer.role };
  }
  return null;
}
