import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { UserRole } from '@specai/database';
import { isTokenIssuedBeforePasswordChange } from './passwordChanged';

export const MOBILE_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 дней

const MOBILE_TOKEN_ISSUER = 'specai-mobile';

export interface MobileTokenPayload {
  userId: string;
  role: UserRole;
}

export interface MobileTokenClaims extends MobileTokenPayload {
  /** Момент выдачи, секунды Unix. */
  iat: number;
  /** Момент истечения, секунды Unix. */
  exp: number;
}

interface TokenOptions {
  /** Секрет подписи; по умолчанию NEXTAUTH_SECRET. */
  secret?: string;
  /** Текущее время в секундах Unix (для тестов). */
  now?: number;
}

function getSecret(override?: string): Uint8Array {
  const secret = override ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

/** Подписывает JWT (HS256) для мобильного клиента сроком на 30 дней. */
export async function signMobileToken(
  payload: MobileTokenPayload,
  options: TokenOptions = {},
): Promise<string> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuer(MOBILE_TOKEN_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + MOBILE_TOKEN_TTL_SEC)
    .sign(getSecret(options.secret));
}

/**
 * Проверяет подпись и срок действия токена. Возвращает claims или null для
 * невалидного/просроченного токена. Проверка смены пароля выполняется отдельно
 * (isMobileTokenRevoked), так как требует обращения к базе.
 */
export async function verifyMobileToken(
  token: string,
  options: TokenOptions = {},
): Promise<MobileTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(options.secret), {
      algorithms: ['HS256'],
      issuer: MOBILE_TOKEN_ISSUER,
      currentDate: options.now !== undefined ? new Date(options.now * 1000) : undefined,
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return null;
    }
    throw error;
  }
}

/** Токен, выданный до последней смены пароля, считается отозванным. */
export function isMobileTokenRevoked(
  claims: Pick<MobileTokenClaims, 'iat'>,
  passwordChangedAt: Date | null | undefined,
): boolean {
  return isTokenIssuedBeforePasswordChange(claims.iat, passwordChangedAt);
}
