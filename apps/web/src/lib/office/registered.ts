// Офис агентов (R17): подрядчик пришёл по ссылке со своей страницы /p/<slug> и
// зарегистрировался — кандидат помечается REGISTERED. Ошибка не ломает регистрацию.

import { prisma } from '@specai/database';

const PROSPECT_SLUG = /^[a-z0-9-]{3,80}$/;

/** Статусы, из которых кандидат-подрядчик может стать «зарегистрировался». */
export const REGISTERABLE_STATUSES = ['PUBLISHED', 'AGREED', 'CONTACTED', 'READY'] as const;

/** Последние 10 цифр номера — так сравниваются телефоны в разных записях. */
export function phoneTail10(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '').slice(-10);
}

/**
 * Сколько кандидатов помечено (0 или 1); при ошибке базы — 0. Телефон
 * регистрирующегося должен совпасть с телефоном (или WhatsApp) из карточки
 * кандидата: иначе любой, у кого есть ссылка на превью, опубликовал бы чужую
 * страницу с чужим номером под своим аккаунтом (REVIEW.md § 1).
 */
export async function markProspectRegistered(
  slug: string | null | undefined,
  registrantPhone: string,
  now: Date = new Date(),
): Promise<number> {
  if (!slug || !PROSPECT_SLUG.test(slug)) return 0;
  const tail = phoneTail10(registrantPhone);
  if (tail.length !== 10) return 0;
  try {
    const result = await prisma.prospect.updateMany({
      where: {
        slug,
        kind: 'provider',
        status: { in: [...REGISTERABLE_STATUSES] },
        OR: [{ phone: { endsWith: tail } }, { whatsapp: { endsWith: tail } }],
      },
      data: { status: 'REGISTERED', registeredAt: now },
    });
    return result.count;
  } catch (error) {
    console.error('[office] could not mark the prospect as registered', error);
    return 0;
  }
}
