// «Встать на линию — попробовать бесплатно» (owner, 2026-10-28): исполнитель
// начинает с именем, телефоном и видом техники, без e-mail и пароля.
// Подтверждения телефона на площадке нет (SMS платные и выключены), поэтому
// телефон помечается «не подтверждён», а частоту ограничиваем по IP и номеру.
// Вход после формы — одноразовый короткий токен для next-auth («quick»);
// приложение получает обычный мобильный токен.

import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { z } from 'zod';

export const QUICK_TOKEN_ISSUER = 'specai-quick';
export const QUICK_TOKEN_TTL_SEC = 10 * 60;
/** Служебный домен: письма на .invalid не отправляются (lib/email.ts). */
export const QUICK_EMAIL_DOMAIN = 'quick.iistroyka24.invalid';

export const QUICK_LIMIT_PER_IP = { limit: 5, windowMs: 60 * 60_000 };
export const QUICK_LIMIT_PER_PHONE = { limit: 3, windowMs: 24 * 60 * 60_000 };

/** «8 (927) 242-80-88», «+7 927…», «927…» → «79272428088»; иначе null. */
export function normalizeRuPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return /^79\d{9}$/.test(digits) ? digits : null;
}

/** «79272428088» → «+7 927 242-80-88». */
export function formatRuPhone(digits: string): string {
  return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

export function quickPlaceholderEmail(random: string = randomBytes(8).toString('hex')): string {
  return `p-${random}@${QUICK_EMAIL_DOMAIN}`;
}

export function isQuickPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${QUICK_EMAIL_DOMAIN}`));
}

export const quickSignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Как к вам обращаться — имя от 2 букв')
    .max(60, 'Имя — до 60 знаков'),
  phone: z.string().transform((value, ctx) => {
    const phone = normalizeRuPhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Телефон в формате +7 9XX XXX-XX-XX' });
      return z.NEVER;
    }
    return phone;
  }),
  categoryId: z.string().trim().min(1, 'Выберите вид техники').max(40),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласие на обработку персональных данных' }),
  }),
  publicConsent: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласие на публикацию карточки на карте' }),
  }),
  lat: z.number().min(41).max(82).optional(),
  lon: z.number().min(19).max(191).optional(),
  city: z.string().trim().max(120).optional(),
  timeZone: z.string().max(60).optional(),
});

export type QuickSignup = z.infer<typeof quickSignupSchema>;

function secret(override?: string): Uint8Array {
  const value = override ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('NEXTAUTH_SECRET is not set');
  return new TextEncoder().encode(value);
}

/** Одноразовый (по сроку) токен входа сразу после лёгкой формы. */
export async function signQuickLoginToken(
  userId: string,
  options: { secret?: string; now?: number } = {},
): Promise<string> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ purpose: 'quick-login' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(QUICK_TOKEN_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + QUICK_TOKEN_TTL_SEC)
    .sign(secret(options.secret));
}

export async function verifyQuickLoginToken(
  token: unknown,
  options: { secret?: string; now?: number } = {},
): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, secret(options.secret), {
      algorithms: ['HS256'],
      issuer: QUICK_TOKEN_ISSUER,
      currentDate: options.now !== undefined ? new Date(options.now * 1000) : undefined,
    });
    if (payload.purpose !== 'quick-login' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}
