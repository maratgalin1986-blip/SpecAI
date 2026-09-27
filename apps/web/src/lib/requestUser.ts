import { getServerSession } from 'next-auth';
import { prisma, type UserRole } from '@specai/database';
import { authOptions } from '@/lib/auth';
import { isMobileTokenRevoked, verifyMobileToken } from '@/lib/mobileAuth';

export interface RequestUser {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  companyId: string | null;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Текущий пользователь запроса: сначала мобильный JWT из `Authorization: Bearer`,
 * иначе — веб-сессия next-auth. Возвращает null, если пользователь не аутентифицирован.
 * Для Bearer-запросов роль и компания берутся из базы, а токен, выданный до
 * последней смены пароля, отклоняется.
 */
export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const token = bearerToken(request);
  if (token) {
    const claims = await verifyMobileToken(token);
    if (!claims) return null;

    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        companyId: true,
        passwordChangedAt: true,
      },
    });
    if (!user || isMobileTokenRevoked(claims, user.passwordChangedAt)) return null;

    return {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
    };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    companyId: session.user.companyId ?? null,
  };
}
