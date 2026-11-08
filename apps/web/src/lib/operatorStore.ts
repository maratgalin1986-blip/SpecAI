// Operators («машинисты») of a provider company: the rows the admin manages
// and the sign-in (e-mail + temporary password, role PROVIDER_OPERATOR) the
// admin creates for them. Used by /api/operators and the cabinets.
import bcrypt from 'bcryptjs';
import { prisma, type Prisma } from '@specai/database';
import { findUserByEmail } from './findUserByEmail';

export const operatorSelect = {
  id: true,
  name: true,
  phone: true,
  licenseNumber: true,
  active: true,
  createdAt: true,
  user: { select: { id: true, email: true } },
} satisfies Prisma.OperatorSelect;

export type OperatorRow = Prisma.OperatorGetPayload<{ select: typeof operatorSelect }>;

export interface OperatorJson {
  id: string;
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  active: boolean;
  /** The sign-in e-mail, when the admin created one. */
  email: string | null;
  createdAt: string;
}

export function operatorToJson(row: OperatorRow): OperatorJson {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    licenseNumber: row.licenseNumber,
    active: row.active,
    email: row.user?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function listOperators(companyId: string) {
  return prisma.operator.findMany({
    where: { companyId },
    select: operatorSelect,
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    take: 200,
  });
}

export class OperatorLoginError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/**
 * The sign-in of an operator: creates the PROVIDER_OPERATOR user with a
 * temporary password, or — when the operator already has one — sets a new
 * password (tokens issued before are revoked through passwordChangedAt).
 * An e-mail that belongs to another account is refused.
 */
export async function setOperatorLogin(
  tx: Prisma.TransactionClient,
  operator: {
    id: string;
    name: string;
    phone: string | null;
    companyId: string;
    userId: string | null;
  },
  login: { email: string; password: string },
): Promise<string> {
  const passwordHash = await bcrypt.hash(login.password, 10);
  const now = new Date();
  if (operator.userId) {
    const user = await tx.user.findUnique({
      where: { id: operator.userId },
      select: { email: true },
    });
    if (user && user.email !== login.email) {
      const taken = await findUserByEmail(login.email, { select: { id: true } });
      if (taken && taken.id !== operator.userId) {
        throw new OperatorLoginError('Этот e-mail уже занят другим аккаунтом');
      }
    }
    await tx.user.update({
      where: { id: operator.userId },
      data: { email: login.email, passwordHash, passwordChangedAt: now },
    });
    return operator.userId;
  }
  const existing = await findUserByEmail(login.email, { select: { id: true } });
  if (existing) {
    throw new OperatorLoginError('Этот e-mail уже зарегистрирован');
  }
  const user = await tx.user.create({
    data: {
      email: login.email,
      name: operator.name,
      phone: operator.phone,
      passwordHash,
      role: 'PROVIDER_OPERATOR',
      companyId: operator.companyId,
      emailVerified: now,
    },
    select: { id: true },
  });
  await tx.operator.update({ where: { id: operator.id }, data: { userId: user.id } });
  return user.id;
}
