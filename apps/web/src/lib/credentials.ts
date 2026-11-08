import bcrypt from 'bcryptjs';
import { type UserRole } from '@specai/database';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { loginSchema } from '@specai/shared';
import { isRateLimited, recordAttempt, resetRateLimit } from '@/lib/rateLimit';
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
 *
 * Считаются только неудачные попытки: диспетчер, входящий с телефона, планшета
 * и компьютера, или офис за одним адресом не упираются в лимит без единой
 * ошибки пароля. Успешный вход сбрасывает счётчики e-mail и IP.
 */
export async function authenticateWithCredentials(
  credentials: unknown,
  options: { ip?: string } = {},
): Promise<AuthenticatedUser | null> {
  const ipKey = options.ip ? `login:ip:${options.ip}` : null;
  if (ipKey) {
    const byIp = isRateLimited(ipKey, LOGIN_LIMIT_PER_IP);
    if (!byIp.ok) throw new LoginError(LOGIN_RATE_LIMITED, byIp.retryAfterSec);
  }

  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    if (ipKey) recordAttempt(ipKey, LOGIN_LIMIT_PER_IP);
    return null;
  }

  const emailKey = `login:email:${parsed.data.email}`;
  const byEmail = isRateLimited(emailKey, LOGIN_LIMIT_PER_EMAIL);
  if (!byEmail.ok) throw new LoginError(LOGIN_RATE_LIMITED, byEmail.retryAfterSec);

  const failed = () => {
    recordAttempt(emailKey, LOGIN_LIMIT_PER_EMAIL);
    if (ipKey) recordAttempt(ipKey, LOGIN_LIMIT_PER_IP);
    return null;
  };

  let user: Awaited<ReturnType<typeof findUserByEmail>>;
  try {
    user = await findUserByEmail(parsed.data.email);
  } catch (error) {
    console.error('[auth] database is unavailable during sign-in', error);
    throw new LoginError(LOGIN_UNAVAILABLE);
  }
  if (!user?.passwordHash) {
    return failed();
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return failed();
  }

  // Only the address's own counter: clearing the IP's would let one valid
  // account at that IP wipe the limit after every batch of guesses.
  resetRateLimit(emailKey);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  };
}
