import bcrypt from 'bcryptjs';
import { type UserRole } from '@specai/database';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { loginSchema } from '@specai/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string | null;
}

/**
 * Единая проверка e-mail/пароля для веб-входа (next-auth Credentials) и
 * мобильного входа (POST /api/mobile/login). Возвращает null при любой ошибке,
 * не раскрывая, существует ли пользователь.
 */
export async function authenticateWithCredentials(
  credentials: unknown,
): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }

  const user = await findUserByEmail(parsed.data.email);
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
