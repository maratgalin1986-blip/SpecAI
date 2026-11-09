// Офис агентов (R17): подрядчик пришёл по ссылке со своей страницы /p/<slug> и
// зарегистрировался — кандидат помечается REGISTERED. Ошибка не ломает регистрацию.

import { prisma } from '@specai/database';

const PROSPECT_SLUG = /^[a-z0-9-]{3,80}$/;

/** Статусы, из которых кандидат-подрядчик может стать «зарегистрировался». */
export const REGISTERABLE_STATUSES = ['PUBLISHED', 'AGREED', 'CONTACTED', 'READY'] as const;

/** Сколько кандидатов помечено (0 или 1); при ошибке базы — 0. */
export async function markProspectRegistered(
  slug: string | null | undefined,
  now: Date = new Date(),
): Promise<number> {
  if (!slug || !PROSPECT_SLUG.test(slug)) return 0;
  try {
    const result = await prisma.prospect.updateMany({
      where: { slug, kind: 'provider', status: { in: [...REGISTERABLE_STATUSES] } },
      data: { status: 'REGISTERED', registeredAt: now },
    });
    return result.count;
  } catch (error) {
    console.error('[office] could not mark the prospect as registered', error);
    return 0;
  }
}
