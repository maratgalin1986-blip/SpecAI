import bcrypt from 'bcryptjs';
import { type UserRole } from '@specai/database';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { loginSchema } from '@specai/shared';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  LOGIN_LIMIT_PER_EMAIL,
  LOGIN_LIMIT_PER_IP,
  LOGIN_RATE_LIMITED,
  LOGIN_UNAVAILABLE,
  LoginError,
} from '@/lib/loginErrors';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string | null;
}

/**
 * Единая проверка e-mail/пароля для веб-входа (next-auth Credentials) и
 * мобильного входа (POST /api/mobile/login). Возвращает null при неверных
 * данных, не раскрывая, существует ли пользователь. Бросает LoginError, если
 * попыток слишком много (лимит на e-mail и, если передан, на IP) или база
 * недоступна — тогда пользователь видит не «неверный пароль», а причину.
 */
export async function authenticateWithCredentials(
  credentials: unknown,
  options: { ip?: string } = {},
): Promise<AuthenticatedUser | null> {
  if (options.ip) {
    const byIp = checkRateLimit(`login:ip:${options.ip}`, LOGIN_LIMIT_PER_IP);
    if (!byIp.ok) throw new LoginError(LOGIN_RATE_LIMITED, byIp.retryAfterSec);
  }

  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }

  const byEmail = checkRateLimit(`login:email:${parsed.data.email}`, LOGIN_LIMIT_PER_EMAIL);
  if (!byEmail.ok) throw new LoginError(LOGIN_RATE_LIMITED, byEmail.retryAfterSec);

  let user: Awaited<ReturnType<typeof findUserByEmail>>;
  try {
    user = await findUserByEmail(parsed.data.email);
  } catch (error) {
    console.error('[auth] database is unavailable during sign-in', error);
    throw new LoginError(LOGIN_UNAVAILABLE);
  }
  if (!user?.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  };
}
