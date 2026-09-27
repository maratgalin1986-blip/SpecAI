import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@specai/database';
import type { VerificationTokenType } from '@specai/database';

/**
 * Одноразовые токены для сброса пароля и подтверждения email.
 *
 * В базе хранится только sha256-хэш: утечка таблицы не даёт возможности
 * воспользоваться ссылками из писем. Сырой токен живёт лишь в письме.
 */

export type { VerificationTokenType };

/** sha256(raw) в hex — детерминированно, без соли (токен уже случайный, 256 бит). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Случайный сырой токен: 32 байта → 64 hex-символа. */
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

/** Создаёт токен, сохраняет хэш и возвращает сырое значение для письма. */
export async function createToken(
  userId: string,
  type: VerificationTokenType,
  ttlMinutes: number,
): Promise<string> {
  const raw = generateRawToken();
  await prisma.verificationToken.create({
    data: {
      token: hashToken(raw),
      type,
      userId,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
  return raw;
}

/**
 * Атомарно помечает токен использованным и возвращает userId.
 * null — если токена нет, он другого типа, уже использован или просрочен.
 */
export async function consumeToken(
  raw: string,
  type: VerificationTokenType,
): Promise<string | null> {
  if (!raw || raw.length > 256) return null;
  const token = hashToken(raw);
  const now = new Date();

  const updated = await prisma.verificationToken.updateMany({
    where: { token, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (updated.count !== 1) return null;

  const record = await prisma.verificationToken.findUnique({
    where: { token },
    select: { userId: true },
  });
  return record?.userId ?? null;
}
