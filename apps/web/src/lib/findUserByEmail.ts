import { prisma } from '@specai/database';

/**
 * Emails are lower-cased on the way in since the auth hardening, but
 * accounts created before that are stored as typed. Try the exact
 * (normalised) address first, then fall back to a case-insensitive match so
 * those users can still sign in and reset their password. `email` is
 * unique, so the fallback cannot return the wrong account.
 */
export async function findUserByEmail<S extends Parameters<typeof prisma.user.findFirst>[0]>(
  email: string,
  args?: Omit<NonNullable<S>, 'where'>,
) {
  const exact = await prisma.user.findFirst({ ...args, where: { email } });
  if (exact) return exact;
  return prisma.user.findFirst({
    ...args,
    where: { email: { equals: email, mode: 'insensitive' } },
  });
}
